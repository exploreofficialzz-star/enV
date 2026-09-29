# enV Mockups — Platform Research Records

Date researched: 2026-09-29
Source of truth: `enV_Mockups_Master_Implementation_Prompt.txt`

## Research-tool findings

- Mockly: structured chat/post/comment/story/email/notification mockups; platform-specific layouts; dark mode; device frames; PNG/video export.
- ChatReplica: browser-side chat mockups for WhatsApp, Messenger, Instagram DM and X; profiles, timestamps, read receipts, reordering, phone frame and 2x PNG export.
- ChatMock: browser-local rendering, platform-specific bubble/read-receipt/timestamp/dark-mode details, 1x/2x/3x PNG.
- MockUp Buddy: platform/social layouts, iOS/Android chrome selection, post/story/reel/carousel layouts, editable profile/caption/engagement/media and PNG/MP4 export.

## Platform records

Each record distinguishes verified public behavior from assumptions.

### WhatsApp
- Sources: WhatsApp Help Center; Meta/WhatsApp public documentation; Mockly WhatsApp generator.
- Screens: direct chat, group chat, status/notification/call surfaces where applicable.
- Media: text, image, video, audio/voice note, document, sticker/GIF, location/contact/link where applicable.
- UI: chat header, participant identity, timestamps, message states, composer/attachment controls, light/dark behavior.
- Research status: deep benchmark; verify exact version-specific details before final visual snapshots.
- Limitation: public documentation does not guarantee every internal/private UI detail.

### Instagram DM / Posts
- Sources: Meta/Instagram public Help Center; MockUp Buddy; ChatReplica/Mockly.
- Screens: DM, group DM, post, notification, call.
- Media: text, image/video, reactions, voice messages where publicly documented.
- UI: profile/header, DM conversation, read/seen indicators, media presentation, dark/light behavior.
- Research status: adapter implemented; exact platform-version chrome requires visual verification.

### iMessage
- Sources: Apple Support/User Guide for Messages; Mockly/ChatReplica.
- Screens: conversation, group conversation, notification, call/voice surfaces.
- Media: text, photos/video, audio messages, tapbacks/reactions, attachments.
- UI: iOS-specific header, blue/green message behavior, timestamps/status and composer.
- Research status: public behavior identified; visual golden verification remains required.

### Messenger
- Sources: Meta/Messenger Help Center; Mockly/ChatReplica.
- Screens: direct/group chat, notification, voice/video call, post-related messaging.
- Media: text, images/video, audio/voice messages, reactions/replies where supported.
- UI: participant header, seen/read indicators, composer and media controls.
- Research status: public behavior identified; exact current chrome requires visual verification.

### Discord
- Sources: Discord Support documentation.
- Screens: DM, group DM, server/channel conversation, threads, voice/video.
- Media: attachments, reactions, GIFs/stickers, voice/video.
- UI: sidebar/channel model, thread replies, message metadata, composer.
- Research status: public behavior identified; server-specific presentation remains outside generic DM assumptions.

### Telegram
- Sources: Telegram FAQ/public documentation.
- Screens: direct/group chat, channels, calls, notification.
- Media: text, photos/video, files, voice messages, stickers/GIFs, reactions.
- UI: chat header, message metadata, reply/forward/reaction presentation.
- Research status: public behavior identified; exact client-version chrome requires snapshots.

### Signal
- Sources: Signal Support.
- Screens: direct/group chat, voice/video call, notification.
- Media: text, images, files, audio, stickers/GIFs, reactions.
- Verified: Signal documents message reactions, message editing, read/delivery behavior, light/dark/system themes and voice/video calls.
- Research status: strong public documentation; platform-specific visual snapshots still required.

### X / Twitter DM and Post
- Sources: X Help Center.
- Screens: DM, group DM, post, notifications.
- Verified: DMs support group conversations, pinning, notifications and read receipts with platform-specific visibility.
- Media: text and shared media; exact current attachment limits are version/account dependent.
- Research status: public behavior identified; exact current post chrome needs visual verification.

### TikTok Chat and Post
- Sources: TikTok Support; MockUp Buddy.
- Screens: direct/group messaging and short-form post surfaces.
- Media: text, media and voice-related features where available.
- UI: creator/profile identity, media-first post presentation.
- Research status: adapter is provisional pending authoritative current UI documentation/snapshots.

### Snapchat
- Sources: Snapchat Support.
- Screens: chat/group chat, voice/video calling, stories.
- Verified: Snapchat documents voice calls from chat/group chat, including group participant limits.
- Media: snaps, chat media, voice/video calls.
- Research status: public behavior identified; exact chat chrome remains snapshot work.

### Slack
- Sources: Slack Help Center.
- Screens: channels, DMs, threads, huddles, notifications.
- Verified: channels/DMs, threads, reactions, huddles with audio/video/screen sharing, clips and accessibility controls.
- Media: files, images, audio/video clips, GIFs.
- Research status: strong public documentation; renderer still needs complete desktop/mobile visual fidelity.

### Google Messages
- Sources: Google Messages Help.
- Verified: RCS supports high-resolution photos/videos, typing indicators, read receipts, group chats and editing; editing expires after 15 minutes.
- Screens: SMS/MMS/RCS conversations and groups.
- Media: text, photos/video, files/attachments depending on transport.
- Research status: strong public documentation; transport-specific differences require explicit scene rules.

### LinkedIn Messaging / Posts
- Sources: LinkedIn Help.
- Verified: messaging supports individual and multi-recipient conversations, message indicators, read/typing controls and emoji reactions.
- Screens: DM, group/multi-recipient thread, post.
- Research status: public behavior identified; exact current post layout needs snapshots.

### Reddit Chat / Post
- Sources: Reddit Help/public documentation.
- Screens: chat, group chat, post/comment/thread surfaces.
- Media: text, links, images and reactions depending on surface.
- Research status: adapter is implemented; current visual details need browser snapshots because Reddit UI varies by client/surface.

### Threads DM / Post
- Sources: Meta/Instagram/Threads public documentation where available.
- Screens: posts, replies and DM surfaces where enabled.
- Research status: current public documentation is less granular than the benchmark platforms; renderer should retain an explicit limitations record rather than invent details.

### Gmail
- Sources: Google Workspace/Gmail and Google Chat Help.
- Screens: email conversation and Google Chat-related surfaces.
- Verified Google Chat behavior includes editing/deleting messages, reactions, file uploads, GIFs, quotes and threads.
- Research status: email renderer must not conflate Gmail mail UI with Google Chat UI.

### Outlook
- Sources: Microsoft Support.
- Verified: Outlook supports email reactions on qualifying Microsoft 365/Exchange Online accounts across web, Windows, Mac, iOS and Android.
- Screens: email conversation and notification surfaces.
- Research status: mail-specific renderer; chat/Teams behavior must remain distinct.

### Email
- Sources: Gmail/Outlook public documentation used as concrete examples; generic Email remains a fictional controlled mockup.
- Screens: inbox/conversation/notification.
- Media: attachments, links and inline images.
- Research status: intentionally generic; no claim that generic Email reproduces a particular provider.

### AI Chat
- Sources: public OpenAI Help Center for ChatGPT Voice and current public AI-chat UI documentation; other providers are not treated as identical.
- Verified: ChatGPT Voice can accept text/images during a voice conversation on supported web/app surfaces.
- Research status: AI Chat remains a controlled generic adapter unless a named provider is selected; provider-specific claims must not be inferred.

### SMS
- Sources: Google Messages public documentation for SMS/MMS/RCS distinctions; Apple Messages documentation for iOS messaging.
- Screens: text conversation and notification.
- Media: transport-dependent.
- Research status: generic SMS adapter; exact UI depends on selected device/template and must not be presented as a specific carrier UI.

### Tinder
- Sources: public Tinder Help where available; current authoritative UI detail is limited.
- Screens: match/chat.
- Media: profile/match imagery and chat media where supported.
- Research status: adapter remains provisional; exact undocumented UI behavior is explicitly not asserted.

### YouTube Community
- Sources: YouTube Help.
- Verified: Community posts can contain text, images, polls/quizzes, GIFs, music and video; Communities support subscriber discussions.
- Screens: community post/feed and notification.
- Research status: public behavior identified; exact current visual chrome requires snapshots.

## Asset/licensing research
- Use official assets only where permission permits.
- Prefer original enV SVG/CSS device frames and generic UI geometry.
- Use user uploads for user-supplied media.
- Track source/license/version/usage restrictions in `MediaAsset`.
- No proprietary source code, private APIs, authentication bypasses or scraped private assets.

## Source index used during this research pass

- Mockly: https://www.getmockly.com/ and https://www.getmockly.com/chats/whatsapp
- ChatReplica: https://chatreplica.com/ and https://chatreplica.com/about
- ChatMock: https://chatmock.net/
- MockUp Buddy: https://www.mockup-buddy.com/
- Signal Support: https://support.signal.org/hc/en-us/articles/6255134251546-Edit-Message ; https://support.signal.org/hc/en-us/articles/360039929972-Message-Reactions ; https://support.signal.org/hc/en-us/articles/360007320951-Chat-Colors-Wallpaper-and-Themes ; https://support.signal.org/hc/en-us/articles/360007060492-Voice-or-Video-Calling
- X Help: https://help.x.com/en/using-x/direct-messages
- Slack Help: https://slack.com/help/articles/4402059015315-Use-huddles-in-Slack ; https://slack.com/help/articles/360059928654-How-to-use-Slack--your-quick-start-guide ; https://slack.com/help/articles/4455747966739-Accessibility-in-Slack
- Google Messages Help: https://support.google.com/messages/answer/13508703 ; https://support.google.com/messages/answer/14929292
- LinkedIn Help: https://www.linkedin.com/help/linkedin/answer/a553627 ; https://www.linkedin.com/help/linkedin/answer/a569649 ; https://www.linkedin.com/help/linkedin/answer/a564261
- Google Chat Help: https://support.google.com/chat/answer/7659784 ; https://support.google.com/chat/answer/16059642
- Microsoft Outlook Support: https://support.microsoft.com/en-us/outlook/mail/reactions-in-microsoft-outlook
- YouTube Help: https://support.google.com/youtube/answer/9409631 ; https://support.google.com/youtube/answer/15739409
- Snapchat Support: https://help.snapchat.com/hc/en-us/articles/7012378465172-How-to-Make-a-Voice-Call-on-Snapchat
- OpenAI Help Center: https://help.openai.com/en/articles/20001274/
