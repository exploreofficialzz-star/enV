export type SocialFamily = 'size'|'caption'|'hashtag'|'bio'|'username'|'mockup'|'engagement';
export type SocialPlatform = 'instagram'|'tiktok'|'youtube'|'facebook'|'x'|'linkedin'|'pinterest'|'snapchat'|'threads'|'reddit'|'discord'|'twitch';

const PLATFORM_DATA: Record<SocialPlatform, {label:string; post:[number,number]; story:[number,number]; profile:[number,number]; banner:[number,number]; tone:string}> = {
 instagram:{label:'Instagram',post:[1080,1080],story:[1080,1920],profile:[320,320],banner:[1080,566],tone:'visual-first'},
 tiktok:{label:'TikTok',post:[1080,1920],story:[1080,1920],profile:[200,200],banner:[1080,1920],tone:'short-form video'},
 youtube:{label:'YouTube',post:[1280,720],story:[1080,1920],profile:[800,800],banner:[2560,1440],tone:'video channel'},
 facebook:{label:'Facebook',post:[1200,630],story:[1080,1920],profile:[180,180],banner:[1640,856],tone:'social feed'},
 x:{label:'X',post:[1600,900],story:[1080,1920],profile:[400,400],banner:[1500,500],tone:'short-form text'},
 linkedin:{label:'LinkedIn',post:[1200,627],story:[1080,1920],profile:[400,400],banner:[1584,396],tone:'professional'},
 pinterest:{label:'Pinterest',post:[1000,1500],story:[1080,1920],profile:[165,165],banner:[1200,675],tone:'visual discovery'},
 snapchat:{label:'Snapchat',post:[1080,1920],story:[1080,1920],profile:[320,320],banner:[1080,1920],tone:'vertical'},
 threads:{label:'Threads',post:[1080,1350],story:[1080,1920],profile:[320,320],banner:[1080,1920],tone:'conversation'},
 reddit:{label:'Reddit',post:[1200,628],story:[1080,1920],profile:[256,256],banner:[1600,400],tone:'community'},
 discord:{label:'Discord',post:[960,540],story:[1080,1920],profile:[512,512],banner:[960,540],tone:'community chat'},
 twitch:{label:'Twitch',post:[1920,1080],story:[1080,1920],profile:[256,256],banner:[1200,480],tone:'live streaming'},
};

export function parseSocialToolId(toolId:string){
 const m=toolId.match(/^(instagram|tiktok|youtube|facebook|x|linkedin|pinterest|snapchat|threads|reddit|discord|twitch)-(.+)$/);
 if(!m) throw new Error(`Unsupported social tool: ${toolId}`);
 const platform=m[1] as SocialPlatform; const rest=m[2];
 const suffixes:[string,SocialFamily][]=[['engagement-calculator','engagement'],['post-mockup','mockup'],['profile-mockup','mockup'],['post-size-guide','size'],['story-size-guide','size'],['profile-size-guide','size'],['banner-size-guide','size'],['caption-helper','caption'],['hashtag-helper','hashtag'],['bio-helper','bio'],['username-generator','username']];
 const hit=suffixes.find(([s])=>rest===s);
 if(!hit) throw new Error(`Unsupported social action: ${rest}`);
 return {platform, action:rest as string, family:hit[1], data:PLATFORM_DATA[platform]};
}
function clean(s:string|undefined,fallback:string){return s?.trim()||fallback}
function words(s:string){return s.toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(Boolean)}
export function buildSocialOutput(toolId:string,input:Record<string,string>){
 const p=parseSocialToolId(toolId), d=p.data;
 if(p.family==='size'){
  const kind=p.action.replace('-size-guide','') as 'post'|'story'|'profile'|'banner'; const [w,h]=d[kind];
  return `${d.label} ${kind.toUpperCase()} SIZE GUIDE\n\nRecommended working size: ${w} × ${h} px\nAspect ratio: ${w}:${h} (${(w/h).toFixed(2)}:1)\nPlatform style: ${d.tone}\n\nUse the exact dimensions as a design target; keep important text and logos inside safe margins and verify the platform's current publishing UI before production.`;
 }
 if(p.family==='caption'){
  const topic=clean(input.topic,'your topic'), audience=clean(input.audience,'your audience'), tone=clean(input.tone,'clear and natural');
  return `${d.label.toUpperCase()} CAPTION OPTIONS\n\n1. ${topic} — a practical idea for ${audience}.\n2. What matters most about ${topic}? Start with one useful takeaway.\n3. ${topic}: simple, specific, and made for ${audience}.\n4. A quick look at ${topic}. Save this if it helps.\n\nTone: ${tone}`;
 }
 if(p.family==='hashtag'){
  const topic=clean(input.topic,'content'), n=Math.min(30,Math.max(3,Number(input.count)||10));
  const base=words(topic).slice(0,5); const tags=[...base.map(x=>`#${x}`),`#${p.platform}`,`#${p.platform}tips`,`#content`,`#creator`,`#${d.tone.replace(/\s+/g,'')}`];
  const unique=[...new Set(tags)]; while(unique.length<n) unique.push(`#${p.platform}${unique.length+1}`);
  return `${d.label.toUpperCase()} HASHTAG SET\n\n${unique.slice(0,n).join(' ')}`;
 }
 if(p.family==='bio'){
  const name=clean(input.name,'Your Name'), role=clean(input.role,'Creator'), focus=clean(input.focus,'useful content');
  return `${d.label.toUpperCase()} BIO OPTIONS\n\n1. ${name} · ${role}\n   Sharing ${focus}. Follow for practical ideas.\n\n2. ${role} helping people explore ${focus}.\n\n3. ${name} | ${focus} | ${d.tone}`;
 }
 if(p.family==='username'){
  const seed=clean(input.seed,'creator').toLowerCase().replace(/[^a-z0-9]/g,''); const count=Math.min(30,Math.max(5,Number(input.count)||10));
  const suffix=['hq','daily','studio','lab','media','hub','works','official','now','guide'];
  return `${d.label.toUpperCase()} USERNAME IDEAS\n\n${Array.from({length:count},(_,i)=>`${seed}${suffix[i%suffix.length]}${i>=suffix.length?i+1:''}`).join('\n')}`;
 }
 if(p.family==='engagement'){
  const likes=Number(input.likes), comments=Number(input.comments), shares=Number(input.shares), saves=Number(input.saves), followers=Number(input.followers);
  for(const [n,v] of Object.entries({likes,comments,shares,saves,followers})) if(!Number.isFinite(v)||v<0) throw new Error(`${n} must be a non-negative number.`);
  if(followers===0) throw new Error('Followers must be greater than zero.');
  const total=likes+comments+shares+saves; const rate=total/followers*100;
  return `${d.label.toUpperCase()} ENGAGEMENT CALCULATOR\n\nLikes: ${likes}\nComments: ${comments}\nShares: ${shares}\nSaves: ${saves}\nFollowers: ${followers}\n\nTotal interactions: ${total}\nEngagement rate by followers: ${rate.toFixed(2)}%\n\nFormula: (likes + comments + shares + saves) ÷ followers × 100`;
 }
 const name=clean(input.name,'Alex'), handle=clean(input.handle,`@${p.platform}demo`), bio=clean(input.bio,'A fictional social profile for design and prototyping.');
 return `<SOCIAL MOCKUP — FICTIONAL>\n\n${d.label}\n${name}\n${handle}\n\n${bio}\n\nPosts   Followers   Following\n  24       1,250       310\n\nThis is a fictional mockup, not authentic platform evidence.`;
}
