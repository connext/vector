# Vector Docs

Documentation for vector uses [MkDocs](https://www.mkdocs.org/) hosted using Github Pages.

**Do not change the file structure of this module** -- it is tightly coupled with the mkdocs theme.

## Running Locally

To run the docs locally, first [install mkdocs-material](https://squidfunk.github.io/mkdocs-material/getting-started/#installation), then run:

```
mkdocs serve
```

MkDocs will build and serve a preview site at `http://127.0.0.1:8000/`. Editing the docs will autoreload the preview site.

To build the docs, run:

```
mkdocs build
```

## Publishing Changes

Changes are published to https://connext.github.io/vector/.

Hypothetically, changes should be automatically published when you push to master. I may not have set up github actions to do this correctly, however. If that doesn't work, you can publish by doing:

`mkdocs gh-deploy --force`

in the documentation module.
