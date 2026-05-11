# uncial-wagtail demo

Local Wagtail project for developing the `uncial_wagtail` package. It is excluded from Python source and wheel distributions.

## Run

```bash
uv sync
bun --filter=uncial-wagtail run demo:migrate
bun --filter=uncial-wagtail run demo:seed
bun --filter=uncial-wagtail run demo
```

Open `http://localhost:8000/admin/` and sign in with `admin` / `admin`.

The demo exposes a headless page endpoint at `/api/uncial/pages/<id>/`.
