# Inspiration

Visual references for gitspore: images, videos, 3D models, other apps, sketches.

## The repo is public

Publishing someone else's image in a public repo needs the creator's permission, and "moodboard" is no exception. In Germany this regularly leads to an Abmahnung (a lawyer's cease-and-desist letter with fees). Old commits keep the file even after deletion. So:

- Third-party images (Pinterest, Dribbble, Behance, screenshots of other apps, game art) go in `_assets/`. Git ignores that folder; the files stay on your machine.
- What we commit is the link plus our own description of the reference.
- Our own sketches, renders and screenshots of gitspore can be committed. So can openly licensed images (CC0, CC-BY, Unsplash) if the entry names the source and license.
- Excalidraw files are JSON and can be committed, unless they embed a third-party image.

`_assets/` is not backed up and teammates can't see it. Keep a shared copy elsewhere (a Pinterest board, a shared drive) and put that link in the entry.

## Adding a reference

Add an entry to `references.md`. Write the description so that it still makes sense when the link is dead.

```markdown
## <short name>, <source>
- Link: <url>
- Local: _assets/<file>          (if there is a local copy)
- What it is: <what you see>
- Why it matters: <what it suggests for gitspore>
- Take / avoid: <what to use, what not to>
```

When several references point the same way, write the direction down in an `aesthetics.md` here (mood, colors, materials, motion, level of polish).
