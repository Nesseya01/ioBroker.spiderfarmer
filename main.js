'use strict';
const {Adapter}=require('@iobroker/adapter-core');
const mqtt=require('mqtt'),fs=require('node:fs'),crypto=require('node:crypto');
class SpiderFarmer extends Adapter{
 constructor(options={}){super({...options,name:'spiderfarmer'});this.pending=new Map();this.lastData=0;this.lastRequest=0;this.busy=new Set();this.on('message',o=>this.handleSetup(o));this.on('ready',()=>this.start().catch(()=>this.log.error('Adapterstart fehlgeschlagen')));this.on('stateChange',(id,s)=>this.command(id,s).catch(()=>this.log.warn('Schaltbefehl fehlgeschlagen')));this.on('unload',cb=>this.close(cb));}
 async handleSetup(o){
  if(!o?.callback)return;
  const reply=r=>this.sendTo(o.from,o.command,r,o.callback),data=o.message||{};
  let acquired=false;
  try{
   if(o.command==='getDevices'){const a=this.authCandidate;if(!a||Date.now()>a.expires){reply([]);return;}reply(a.devices.map(d=>({label:d.name+' ('+d.productType+')',value:d.serial})));return;}
   if(!['requestCode','login','activate'].includes(o.command)){reply({error:'Unknown setup command'});return;}
   if(this.setupBusy)throw Error('Another setup request is running.');
   this.setupBusy=true;acquired=true;
   if(o.command==='requestCode'){
    const email=String(data.email||'').trim();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)throw Error('Enter a valid email address.');
    if(Date.now()-(this.codeRequestedAt||0)<60000)throw Error('Wait at least 60 seconds before requesting another code.');
    this.codeRequestedAt=Date.now();await require('./lib/cloud-api').requestCode(email);this.loginEmail=email;reply({result:'Code requested. Check your email.'});
   }else if(o.command==='login'){
    const email=String(data.email||'').trim(),code=String(data.code||'').trim();if(email!==this.loginEmail||!/^\d{6}$/.test(code))throw Error('Request a code for this email, then enter its six digits.');
    const auth=await require('./lib/cloud-api').login(email,code);if(!auth.devices.length)throw Error('No supported SF-GGS-PS5 device found on this account.');
    this.authCandidate={...auth,expires:Date.now()+15*60000};reply({result:'Signed in. Choose a device, then Activate.'});
   }else{
    const auth=this.authCandidate;if(!auth||Date.now()>auth.expires)throw Error('Setup session expired. Request a new code.');
    const device=auth.devices.find(d=>d.serial===data.serial);if(!device)throw Error('Choose a device from this account.');
    const obj=await this.getForeignObjectAsync('system.adapter.'+this.namespace);if(!obj)throw Error('Adapter instance missing.');
    const native={...obj.native,mqttUsername:this.encrypt(auth.mqttUsername),mqttPassword:this.encrypt(auth.mqttPassword),userId:auth.userId,serial:device.serial,productType:device.productType,_otp:''};
    await this.extendForeignObjectAsync('system.adapter.'+this.namespace,{native});this.authCandidate=undefined;reply({result:'Activated. Settings will reload after the adapter restarts.',reloadBrowser:true});
   }
  }catch(err){reply({error:err.message||'Setup failed'});}finally{if(acquired)this.setupBusy=false;}
 }
 async alias(name,val){if(!this.config.aliasPrefix)return;await this.setForeignStateAsync(this.config.aliasPrefix+'.'+name,{val,ack:true});}
 async put(name,val){await this.setStateAsync(name,{val,ack:true});}
 async status(text){await this.put('info.status',text);await this.alias('Status',text);}
 async obj(id,type,role,unit,write=false){await this.setObjectNotExistsAsync(id,{type:'state',common:{name:id,type,role,unit,read:true,write},native:{}});}
 async start(){
  await this.obj('info.status','string','text');
  if(this.config.aliasPrefix&&!/^0_userdata\.0\.[a-zA-Z0-9_.-]+$/.test(this.config.aliasPrefix))throw Error('Invalid optional alias prefix');
  if(!/^[A-F0-9]{12}$/i.test(this.config.serial)||this.config.productType!=='SF-GGS-PS5'||!this.config.mqttUsername||!this.config.mqttPassword||!this.config.userId){await this.put('info.connection',false);this.log.info('Open adapter settings to sign in and choose a supported device.');return;}
  await this.obj('info.status','string','text');await this.obj('info.lastMessage','number','value.time');
  const sensors={temperature:['Temperatur','°C'],humidity:['Luftfeuchtigkeit','%'],vpd:['VPD','kPa'],ppfd:['Licht','µmol/m²/s'],co2:['CO₂','ppm'],soilTemperature:['Bodentemperatur','°C'],soilMoisture:['Bodenfeuchtigkeit','%'],soilEC:['Bodenleitfähigkeit','mS/cm'],wifiRssi:['WLAN-Signal','dBm']};
  for(const [key,[label,unit]] of Object.entries(sensors)){await this.setObjectNotExistsAsync('sensors.'+key,{type:'state',common:{name:label,type:'number',role:'value',unit,read:true,write:false},native:{}});if(this.config.aliasPrefix)await this.setForeignObjectNotExistsAsync(this.config.aliasPrefix+'.Sensoren.'+key,{type:'state',common:{name:label,type:'number',role:'value',unit,read:true,write:false},native:{}});}
  for(let n=1;n<=5;n++){await this.obj('outlets.'+n+'.state','boolean','indicator');await this.obj('outlets.'+n+'.set','boolean','switch',undefined,true);await this.obj('outlets.'+n+'.mode','number','value');await this.subscribeStatesAsync('outlets.'+n+'.set');if(this.config.aliasPrefix)await this.subscribeForeignStatesAsync(this.config.aliasPrefix+'.Steckplatz'+n+'.Schalten');}
  await this.alias('BridgeOnline',true);await this.alias('GeraetOnline',false);await this.put('info.connection',false);await this.status('Cloud-Verbindung wird hergestellt');
  this.prefix=this.config.productType.replaceAll('-','/');this.up=this.prefix+'/API/UP/'+this.config.serial;this.down=this.prefix+'/API/DOWN/'+this.config.serial;
  this.client=mqtt.connect('mqtts://sf.mqtt.spider-farmer.com:8883',{username:this.config.mqttUsername,password:this.config.mqttPassword,clientId:'seehome48_'+crypto.randomBytes(10).toString('hex'),ca:fs.readFileSync(__dirname+'/lib/vendor-ca.crt'),rejectUnauthorized:true,keepalive:60,reconnectPeriod:15000,connectTimeout:15000,clean:true});
  this.client.on('connect',()=>{this.client.subscribe([this.up,'SF/Offline/'+this.config.userId],async err=>{if(err)return;await this.put('info.connection',true);this.lastData=0;for(const method of ['getSysSta','getDevSta','getConfigFile'])this.request(method).catch(()=>{});});});
  this.client.on('message',(topic,body)=>this.message(topic,body).catch(()=>this.log.warn('Geräterückmeldung konnte nicht verarbeitet werden')));
  this.client.on('error',()=>{this.log.warn('Cloud connection failed; check authentication, broker availability and certificate trust. No credentials are logged.');});this.client.on('close',()=>{this.lastData=0;this.put('info.connection',false).catch(()=>{});this.alias('GeraetOnline',false).catch(()=>{});this.status('Cloud-Verbindung unterbrochen – Wiederverbindung läuft').catch(()=>{});});
  this.timer=this.setInterval(()=>this.heartbeat().catch(()=>{}),10000);
 }
 request(method,extra={}){return new Promise((resolve,reject)=>{if(!this.client?.connected){reject(Error('offline'));return;}const msgId=Date.now()+'_'+crypto.randomBytes(4).toString('hex');const timer=this.setTimeout(()=>{this.pending.delete(msgId);reject(Error('timeout'));},12000);this.pending.set(msgId,{resolve,reject,timer});this.client.publish(this.down,JSON.stringify({method,pid:this.config.serial,uid:String(this.config.userId),msgId,...extra}),{qos:0,retain:false},err=>{if(err){this.clearTimeout(timer);this.pending.delete(msgId);reject(err);}});});}
 async message(topic,body){let m;try{m=JSON.parse(body.toString());}catch{return;}if(topic!==this.up||m.pid&&m.pid!==this.config.serial)return;if(m.code&&m.code!==200)return;const waiter=this.pending.get(String(m.msgId));if(waiter){this.pending.delete(String(m.msgId));this.clearTimeout(waiter.timer);waiter.resolve(m.data||{});}const d=m.data;if(!d||typeof d!=='object')return;
  if(m.method==='getDevSta'){
   this.lastData=Date.now();await this.alias('GeraetOnline',true);await this.alias('LetzteMeldung',this.lastData);await this.put('info.lastMessage',this.lastData);await this.status('Treibhaus verbunden · direkter Cloud-Zugang');
   for(let n=1;n<=5;n++){let v=d.outlet?.['O'+n]?.on;if(v===0||v===1){await this.put('outlets.'+n+'.state',v===1);await this.alias('Steckplatz'+n+'.Zustand',v===1);}}
   const map={temp:'temperature',humi:'humidity',vpd:'vpd',ppfd:'ppfd',co2:'co2',tempSoil:'soilTemperature',humiSoil:'soilMoisture',ECSoil:'soilEC'};
   for(const [key,name]of Object.entries(map)){const v=d.sensor?.[key];if(typeof v==='number'&&Number.isFinite(v)){await this.put('sensors.'+name,v);await this.alias('Sensoren.'+name,v);}}
  }
  if(m.method==='getSysSta'&&typeof d.sys?.wifi?.rssi==='number'){await this.put('sensors.wifiRssi',d.sys.wifi.rssi);await this.alias('Sensoren.wifiRssi',d.sys.wifi.rssi);}
  if(m.method==='getConfigFile'){this.cachedConfig=d.configFile||d;for(let n=1;n<=5;n++){let mode=this.cachedConfig.outlet?.['O'+n]?.modeType;if(typeof mode==='number')await this.put('outlets.'+n+'.mode',mode);}}
 }
 async heartbeat(){await this.alias('BridgeOnline',true);await this.alias('LetzterBridgeKontakt',Date.now());if(!this.client?.connected)return;if(Date.now()-this.lastData>120000){await this.alias('GeraetOnline',false);await this.status('Cloud verbunden · warte auf Rückmeldung der Leiste');}if(Date.now()-this.lastRequest>60000){this.lastRequest=Date.now();this.request('getDevSta').catch(()=>{});}}
 async command(id,s){if(!s||s.ack||typeof s.val!=='boolean')return;let match=id.match(/\.outlets\.([1-5])\.set$/)||id.match(/\.Steckplatz([1-5])\.Schalten$/);if(!match)return;const n=Number(match[1]);try{
  if(this.busy.has(n)||!this.client?.connected||!this.lastData||Date.now()-this.lastData>120000||Date.now()-s.ts>10000)throw Error('not ready');this.busy.add(n);
  const data=await this.request('getConfigFile'),current=(data.configFile||data).outlet?.['O'+n];if(!current||typeof current!=='object')throw Error('no current config');
  await this.request('setConfigField',{params:{keyPath:['outlet','O'+n],['O'+n]:{...current,modeType:0,mOnOff:s.val?1:0}}});await this.request('getDevSta');await this.status('Schaltbefehl verarbeitet – Geräte-Zustand aktualisiert');
 }catch{await this.status('Schaltbefehl nicht bestätigt – Zustand der Leiste prüfen');}finally{this.busy.delete(n);await this.setForeignStateAsync(id,{val:s.val,ack:true});}}
 close(cb){if(this.timer)this.clearInterval(this.timer);for(const p of this.pending.values()){this.clearTimeout(p.timer);p.reject(Error('stopped'));}this.pending.clear();if(this.client)this.client.end(true);Promise.allSettled([this.put('info.connection',false),this.alias('BridgeOnline',false),this.alias('GeraetOnline',false)]).finally(cb);}
}
if(require.main!==module)module.exports=options=>new SpiderFarmer(options);else new SpiderFarmer();
