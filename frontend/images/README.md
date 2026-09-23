# MedVault

MedVault uses React with Vite for the frontend and Node.js with Express for the API.

## Requirements

- Node.js 20 or newer
- npm

## Install

From the project root:

```bash
npm install
npm install --prefix client
npm install --prefix server
```

## Run in development

Start the React frontend and Express API together:

```bash
npm run dev
```

- Frontend: http://localhost:5173
- API: http://localhost:5000
- Health check: http://localhost:5000/api/health

The Vite development server proxies requests beginning with `/api` to Express.

## Run separately

```bash
npm run client
npm run server
```

## Build the frontend

```bash
npm run build
```
