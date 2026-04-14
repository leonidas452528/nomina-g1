# GestNómina G1 — Azure Static Web App

## Estructura
```
nomina-app/
├── public/
│   ├── index.html              ← Frontend completo
│   └── staticwebapp.config.json
└── api/
    ├── host.json
    ├── package.json            ← npm install mssql
    └── query/
        ├── index.js            ← Azure Function (backend)
        └── function.json
```

## Despliegue en Azure Static Web Apps

### Paso 1 — Subir a GitHub
1. Crea un repositorio nuevo en github.com (ej. `nomina-g1`)
2. Sube toda esta carpeta al repo

### Paso 2 — Crear Static Web App en Azure
1. Azure Portal → busca **"Static Web Apps"** → **+ Create**
2. Llena:
   - Resource group: `GestionNomina-G1`
   - Name: `nomina-g1-app`
   - Plan: **Free**
   - Region: `Central US`
   - Source: **GitHub** → autoriza → selecciona tu repo
   - Branch: `main`
   - Build preset: **Custom**
   - App location: `/public`
   - API location: `/api`
   - Output location: (vacío)
3. Clic **Review + Create** → **Create**
4. Azure genera un link público automáticamente

### Paso 3 — Variables de entorno (secretos SQL)
1. En el Static Web App → **Configuration** → **Application settings**
2. Agrega estas 4 variables:

| Nombre        | Valor                                      |
|---------------|-------------------------------------------|
| SQL_SERVER    | sqlserver-g1-nomina.database.windows.net  |
| SQL_DATABASE  | GestionNomina                             |
| SQL_USER      | adminG1                                   |
| SQL_PASSWORD  | SqlG1@2025!                               |

3. Clic **Save**

### ¡Listo! Tu app estará en:
`https://nomina-g1-app.azurestaticapps.net`

## Seguridad implementada
- Todos los queries usan `r.input()` con tipos explícitos (anti SQL Injection)
- Credenciales en variables de entorno (nunca en el código)
- CORS configurado en staticwebapp.config.json
