module.exports = async function (context, req) {
  const action = req.params.action;

  function resp(status, body) {
    context.res = {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: JSON.stringify(body)
    };
  }

  if (req.method === 'OPTIONS') { resp(200, ''); return; }

  const server   = process.env.SQL_SERVER;
  const database = process.env.SQL_DATABASE;
  const user     = process.env.SQL_USER;
  const password = process.env.SQL_PASSWORD;

  if (!server) { resp(500, { error: 'Variables de entorno no configuradas' }); return; }

  // Token via OAuth2 client credentials para Azure SQL
  async function getToken() {
    const body = new URLSearchParams({
      grant_type:    'password',
      resource:      'https://database.windows.net/',
      client_id:     '7f98cb04-cd1e-40df-9140-3bf7e2cea2a7', // Azure SQL público
      username:      `${user}@${server.split('.')[0]}`,
      password:      password,
      scope:         'openid'
    });
    const r = await fetch(`https://login.microsoftonline.com/common/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });
    const data = await r.json();
    if (!data.access_token) throw new Error('No se pudo obtener token: ' + JSON.stringify(data));
    return data.access_token;
  }

  async function execQuery(sql) {
    const token = await getToken();
    const url = `https://${server}/${database}/query?api-version=2014-04`;
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({ query: sql })
    });
    const data = await r.json();
    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
    return data;
  }

  try {
    if (action === 'catalogos') {
      const [d, c, e] = await Promise.all([
        execQuery(`SELECT id_departamento AS id, nombre_departamento AS nombre FROM Departamento WHERE activo=1`),
        execQuery(`SELECT id_cargo AS id, nombre_cargo AS nombre FROM Cargo`),
        execQuery(`SELECT id_empleado AS id, primer_nombre+' '+primer_apellido AS nombre FROM Empleado WHERE activo=1`)
      ]);
      resp(200, { departamentos: d, cargos: c, empleados: e });
      return;
    }
    resp(404, { error: 'Ruta no encontrada: ' + action });
  } catch(err) {
    resp(500, { error: err.message });
  }
};
