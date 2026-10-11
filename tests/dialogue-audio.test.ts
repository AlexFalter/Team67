import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error The encounter playback helper is JavaScript.
import {createDialogueAudio} from '../apps/client/src/npcPrototype/src/shared/dialogue/dialogue-audio.js';

test('blocked recorded dialogue retries on real input and cancelled lines never restart',async()=>{
 const originalAudio=globalThis.Audio,originalDocument=globalThis.document;
 const listeners=new Map<string,(event:{isTrusted:boolean})=>void>();let allowed=false;
 class FakeAudio {
  paused=true;preload='';attempts=0;
  constructor(public src:string){}
  play(){this.attempts++;if(!allowed)return Promise.reject(new DOMException('Gesture required','NotAllowedError'));this.paused=false;return Promise.resolve();}
  pause(){this.paused=true;}
 }
 globalThis.Audio=FakeAudio as unknown as typeof Audio;
 globalThis.document={addEventListener:(name:string,listener:(event:{isTrusted:boolean})=>void)=>listeners.set(name,listener),removeEventListener:(name:string)=>listeners.delete(name)} as unknown as Document;
 try{
  const voice=createDialogueAudio('/audio/frankfurt-dialogue.mp3'),playing=voice.play();
  await new Promise(resolve=>setTimeout(resolve,0));assert.equal(voice.dialoguePlaybackState().blocked,true);assert.equal(listeners.size,3);
  listeners.get('keydown')!({isTrusted:false});assert.equal(voice.attempts,1,'synthetic input cannot bypass policy');
  allowed=true;listeners.get('keydown')!({isTrusted:true});await playing;
  assert.equal(voice.paused,false);assert.equal(voice.dialoguePlaybackState().pending,false);assert.equal(listeners.size,0);
  voice.pause();allowed=false;
  const cancelled=createDialogueAudio('/audio/finance-guy.mp3'),pending=cancelled.play();
  await new Promise(resolve=>setTimeout(resolve,0));assert.equal(cancelled.dialoguePlaybackState().blocked,true);
  const rejection=assert.rejects(pending,{name:'AbortError'});cancelled.pause();await rejection;
  assert.equal(cancelled.paused,true);assert.equal(listeners.size,0,'reset removes gesture retries');
 }finally{globalThis.Audio=originalAudio;globalThis.document=originalDocument;}
});
