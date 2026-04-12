# btca

<a href="https://www.npmjs.com/package/btca"><img alt="npm" src="https://img.shields.io/npm/v/btca?style=flat-square" /></a>

https://btca.dev

Ask your AI agent questions about libraries and frameworks by searching the actual source code, not outdated docs.

> [!WARNING]
> btca is being rewritten right now. The new version will overwrite the current one with full backwards compatibility, while fixing a ton of issues and massively improving performance. It is being rebuilt around [pi agent and node](https://github.com/davis7dotsh/btca-3) to improve the Windows experience.

## A note on this project

I've been testing a ton, and I mean a ton of stuff for how to make the local experience better.

- Custom pi agent
- New cli
- A pi extension
- A complex resource management cli

And as I've done all of these things I've come to realize, that the local version of this probably just should have been a skill.

So at least for now, it is. I know that sounds dumb, but just trust me the experience is great. I highly recommend doing this with pi or codex:

## getting started

1. install the skill: `npx skills add https://github.com/davis7dotsh/better-context --skill btca-local`
2. three ways to use it:
   1. during any prompt simply say "use btca" and your coding agent will now clone/search important repos in `~/.btca/agent/sandbox`, improving your output quality
   2. invoke the skill from your coding agent with "/btc..." or "$btc..." (depends on your agent) and it will feel like the old tui
   3. invoke the skill the same way as above, but this time include a question/prompt. basically the same thing as `btca ask`

## the future of this project

- the web app will continue to be expanded and supported. I can do things there I can't do locally, and I don't want to make that experience worse
- the local version might get revisited in the future. it being a "subagent" for search was actually quite nice. main issue with the new system is it clogs the main context window...
