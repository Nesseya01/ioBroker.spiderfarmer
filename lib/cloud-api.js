'use strict';
// Protocol and AES framing ported from soma-web/hass-spider-farmer (MIT).
// Static application key/IV are vendor protocol constants, not account credentials.
const crypto=require('node:crypto');
const KEY=Buffer.from('Meizhi1234567890'),IV=Buffer.from('1234567890123456');
function encrypt(value){const c=crypto.createCipheriv('aes-128-cbc',KEY,IV);return Buffer.concat([c.update(JSON.stringify(value??{}),'utf8'),c.final()]).toString('base64');}
function decrypt(wire){const c=crypto.createDecipheriv('aes-128-cbc',KEY,IV);return JSON.parse(Buffer.concat([c.update(Buffer.from(wire,'base64')),c.final()]).toString('utf8'));}
async function call(path,payload,token){
 const systemdata={reqId:crypto.randomInt(1,999999999),appVersion:'2.5.2',osType:'Android',osVersion:'14',deviceType:'iobroker',deviceId:'iobroker',netType:'wifi',timestamp:Math.floor(Date.now()/1000),wifiName:'unknown_data',timezone:'Europe/Berlin',language:'English'};
 if(token)systemdata.token=token;
 let response;
 try{const r=await fetch('https://api.spider-farmer.com/api/android/'+path,{method:'POST',redirect:'error',headers:{'content-type':'application/json','user-agent':'Dart/3.5 (dart:io)',systemdata:JSON.stringify(systemdata)},body:encrypt(payload),signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('HTTP '+r.status);response=decrypt(await r.text());}catch{throw Error('Cloud request failed. Check network and try again.');}
 if(response?.code!=='000')throw Error('Cloud rejected request (code '+String(response?.code??'unknown').replace(/[^a-zA-Z0-9_-]/g,'')+'). Check the email/code.');
 return response.data;
}
async function requestCode(email){await call('ulogin/getEmailCode/v2',{email,isLogin:1});}
async function login(email,code){
 const auth=await call('ulogin/mailLogin/v2',{email,loginMethod:2,otpCode:code});
 if(!auth?.mqttName||!auth.mqttPwd||!auth.userId||!auth.token)throw Error('Incomplete cloud session.');
 const rooms=await call('udm/getUserRooms/v2',{},auth.token)||[],devices=new Map();
 for(const room of rooms){if(room.id===undefined)continue;const rows=await call('udm/getDeviceList/v2',{belonginRoomId:room.id,userId:auth.userId},auth.token)||[];for(const d of rows){if(d.productType==='SF-GGS-PS5'&&/^[a-f0-9]{12}$/i.test(d.deviceSerialnum)){devices.set(d.deviceSerialnum,{serial:d.deviceSerialnum,name:d.deviceName||'GGS PS5',productType:d.productType});}}}
 return {mqttUsername:auth.mqttName,mqttPassword:auth.mqttPwd,userId:String(auth.userId),devices:[...devices.values()]};
}
module.exports={encrypt,decrypt,call,requestCode,login};
