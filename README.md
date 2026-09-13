# MediaList

Friends recommend you watch things, then you watch them! The look is a
swappable skin (the bundled one is a cringe 90s site) — but you do you.

A tiny, zero-dependency Node web app that lets people you share it with
search TMDB (movies, TV, anime) and **queue up recommendations** for you.
You mark things as watched. One process, one JSON file, no npm packages,
no build step.

The look is a swappable skin (the bundled one is a cringe 90s site), and the
site name is yours to choose — **the build doc has a two-line form for
both**.

**👉 Start here: [How2Build-MediaList.md](./How2Build-MediaList.md)** —
the complete build & deploy guide: TMDB key, quickstart with test checklist,
always-on options (systemd/launchd), putting it on the internet (Caddy or a
tunnel), backups, the full API reference, and how to swap the skin.

```
cp .env.example .env   # add your TMDB key + admin password
node server.js         # that's it
```

## License

[GNU GPLv3](./LICENSE) — always. Written by humans and machines alike, and it
stays open source no matter who writes the next line: forks stay open,
modifications stay open, the queue stays yours.
