# Template Publications Testing

## Preconditions

- DB migration applied
- server running on `http://localhost:3000`
- you have a valid bearer token for a user session
- for SEO visibility tests, use an admin user if you want to set `visibility=both` and `verificationStatus=verified|editorial`

## Manual API flow

### 1. Create publication from current project

`POST /api/template-publications/project`

Body example:

```json
{
  "kind": "template",
  "title": "Строительство поликлиники",
  "visibility": "both",
  "verificationStatus": "verified"
}
```

### 2. Create publication from selection

`POST /api/template-publications/selection`

Body example:

```json
{
  "kind": "block",
  "title": "Электрика для жилого дома",
  "rootTaskIds": ["task-id-1", "task-id-2"],
  "visibility": "both",
  "verificationStatus": "verified"
}
```

### 3. Check private publication list

`GET /api/template-publications`

### 4. Check public SEO list

`GET /api/public/template-publications?visibilityTarget=site&kind=template`

### 5. Check public detail

`GET /api/public/template-publications/:slug?visibilityTarget=site`

### 6. Consume publication

- `POST /api/template-publications/:publicationId/create-project`
- `POST /api/template-publications/:publicationId/insert`

## Smoke script

Set env:

```powershell
$env:TOKEN="your bearer token"
$env:BASE_URL="http://localhost:3000"
```

Examples:

```powershell
npm run smoke:template-publications -- list
npm run smoke:template-publications -- create-project template "Строительство поликлиники"
npm run smoke:template-publications -- create-selection block "task-id-1,task-id-2" "Электрика для жилого дома"
npm run smoke:template-publications -- public-list template
npm run smoke:template-publications -- public-get stroitelstvo-polikliniki
```

## Site verification

- `/templates`
- `/blocks`
- `/templates/:slug`
- `/blocks/:slug`

If the site build runs without a live server, the pages still build with empty catalogs. For real content verification, run the site against a live server with published SEO-visible publications.
