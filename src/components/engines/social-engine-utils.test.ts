import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSocialOutput, parseSocialToolId } from './social-engine-utils.ts';
test('parses all social families',()=>{ for(const id of ['instagram-post-size-guide','tiktok-caption-helper','youtube-hashtag-helper','facebook-bio-helper','x-username-generator','linkedin-profile-mockup','pinterest-engagement-calculator']) assert.ok(parseSocialToolId(id).family); });
test('size guide is deterministic',()=>assert.match(buildSocialOutput('instagram-post-size-guide',{}),/1080 × 1080/));
test('engagement validates and calculates',()=>{assert.match(buildSocialOutput('instagram-engagement-calculator',{likes:'100',comments:'20',shares:'10',saves:'5',followers:'1000'}),/13\.50%/);assert.throws(()=>buildSocialOutput('instagram-engagement-calculator',{likes:'1',comments:'0',shares:'0',saves:'0',followers:'0'}));});
test('mockup is explicitly fictional',()=>assert.match(buildSocialOutput('reddit-profile-mockup',{}),/fictional mockup/i));
