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

  async function getToken() {
    const body = new URLSearchParams({
      grant_type: 'password',
      resource:   'https://database.windows.net/',
      client_id:  '7f98cb04-cd1e-40df-9140-3bf7e2cea2a7',
      username:   user,
      password:   password,
      scope:      'openid'
    });
    const r = await fetch('https://login.microsoftonline.com/common/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });
    const data = await r.json();
    if (!data.access_token) throw new Error('Token error: ' + (data.error_description || JSON.stringify(data)));
    return data.access_token;
  }

  async function sql(query) {
    const token = await getToken();
    const r = await fetch(`https://${server}/${database}/query?api-version=2014-04`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ query })
    });
    const data = await r.json();
    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
    return Array.isArray(data) ? data : (data.ResultSets ? Object.values(data.ResultSets)[0] || [] : []);
  }

  try {
    // ── Catálogos ──────────────────────────────────────────────────────────
    if (action === 'catalogos') {
      const [deptos, cargos, emps] = await Promise.all([
        sql(`SELECT id_departamento AS id, nombre_departamento AS nombre FROM Departamento WHERE activo=1`),
        sql(`SELECT id_cargo AS id, nombre_cargo AS nombre FROM Cargo`),
        sql(`SELECT id_empleado AS id, primer_nombre+' '+primer_apellido AS nombre FROM Empleado WHERE activo=1`)
      ]);
      resp(200, { departamentos: deptos, cargos, empleados: emps }); return;
    }

    // ── Empleados GET ──────────────────────────────────────────────────────
    if (action === 'empleados' && req.method === 'GET') {
      const rows = await sql(`
        SELECT e.id_empleado, e.primer_nombre+' '+e.primer_apellido AS nombre,
          e.num_identificacion AS nid, e.email_corporativo AS email,
          e.telefono, e.fecha_contratacion, e.tipo_contrato,
          e.salario_actual AS salario, e.activo,
          d.nombre_departamento AS depto, c.nombre_cargo AS cargo,
          e.id_departamento, e.id_cargo
        FROM Empleado e
        JOIN Departamento d ON e.id_departamento=d.id_departamento
        JOIN Cargo c ON e.id_cargo=c.id_cargo
        WHERE e.activo=1 ORDER BY e.primer_apellido`);
      resp(200, rows); return;
    }

    // ── Empleados POST ─────────────────────────────────────────────────────
    if (action === 'empleados' && req.method === 'POST') {
      const b = req.body;
      const fn  = b.fecha_nacimiento   ? `'${b.fecha_nacimiento}'`   : 'NULL';
      const fc  = b.fecha_contratacion ? `'${b.fecha_contratacion}'` : 'GETDATE()';
      const tel = b.telefono ? `'${b.telefono.replace(/'/g,"''")}'`  : 'NULL';
      await sql(`
        INSERT INTO Empleado(primer_nombre,primer_apellido,num_identificacion,tipo_identificacion,
          fecha_nacimiento,genero,email_corporativo,telefono,fecha_contratacion,
          tipo_contrato,salario_actual,id_departamento,id_cargo)
        VALUES(
          '${b.primer_nombre.replace(/'/g,"''")}','${b.primer_apellido.replace(/'/g,"''")}',
          '${b.num_identificacion.replace(/'/g,"''")}','${(b.tipo_identificacion||'CC')}',
          ${fn},'${b.genero||'M'}','${b.email_corporativo.replace(/'/g,"''")}',${tel},
          ${fc},'${b.tipo_contrato||'INDEFINIDO'}',${parseFloat(b.salario_actual)},
          ${parseInt(b.id_departamento)},${parseInt(b.id_cargo)})`);
      resp(201, { ok: true, mensaje: 'Empleado creado' }); return;
    }

    // ── Empleados PUT ──────────────────────────────────────────────────────
    if (action === 'empleados' && req.method === 'PUT') {
      const b = req.body;
      const tel = b.telefono ? `'${b.telefono.replace(/'/g,"''")}'` : 'NULL';
      await sql(`
        UPDATE Empleado SET
          primer_nombre='${b.primer_nombre.replace(/'/g,"''")}',
          primer_apellido='${b.primer_apellido.replace(/'/g,"''")}',
          email_corporativo='${b.email_corporativo.replace(/'/g,"''")}',
          telefono=${tel}, salario_actual=${parseFloat(b.salario_actual)},
          tipo_contrato='${b.tipo_contrato}',
          id_departamento=${parseInt(b.id_departamento)},
          id_cargo=${parseInt(b.id_cargo)}
        WHERE id_empleado=${parseInt(b.id_empleado)} AND activo=1`);
      resp(200, { ok: true }); return;
    }

    // ── Empleados DELETE (baja lógica) ─────────────────────────────────────
    if (action === 'empleados' && req.method === 'DELETE') {
      await sql(`UPDATE Empleado SET activo=0 WHERE id_empleado=${parseInt(req.query.id)}`);
      resp(200, { ok: true }); return;
    }

    // ── Nóminas GET ────────────────────────────────────────────────────────
    if (action === 'nominas' && req.method === 'GET') {
      const filtro = req.query.estado ? `AND n.estado='${req.query.estado}'` : '';
      const rows = await sql(`
        SELECT n.id_nomina, n.id_empleado,
          e.primer_nombre+' '+e.primer_apellido AS empleado,
          n.anio, n.mes, n.salario_base, n.dias_trabajados,
          n.total_devengado, n.total_deducciones, n.neto_pagado,
          n.fecha_pago, n.estado
        FROM Nomina n
        JOIN Empleado e ON n.id_empleado=e.id_empleado
        WHERE 1=1 ${filtro} ORDER BY n.anio DESC, n.mes DESC`);
      resp(200, rows); return;
    }

    // ── Nóminas POST ───────────────────────────────────────────────────────
    if (action === 'nominas' && req.method === 'POST') {
      const b = req.body;
      await sql(`
        INSERT INTO Nomina(id_empleado,anio,mes,salario_base,dias_trabajados,
          total_devengado,total_deducciones,neto_pagado,estado)
        VALUES(${parseInt(b.id_empleado)},${parseInt(b.anio)},${parseInt(b.mes)},
          ${parseFloat(b.salario_base)},${parseInt(b.dias_trabajados)||30},
          ${parseFloat(b.total_devengado)||0},${parseFloat(b.total_deducciones)||0},
          ${parseFloat(b.neto_pagado)||0},'BORRADOR')`);
      resp(201, { ok: true }); return;
    }

    // ── Nóminas estado PUT ─────────────────────────────────────────────────
    if (action === 'nominas-estado' && req.method === 'PUT') {
      const b = req.body;
      await sql(`
        UPDATE Nomina SET estado='${b.estado}',
          fecha_pago=CASE WHEN '${b.estado}'='PAGADA' THEN CAST(GETDATE() AS DATE) ELSE fecha_pago END
        WHERE id_nomina=${parseInt(b.id_nomina)}`);
      resp(200, { ok: true }); return;
    }

    // ── Ausencias GET ──────────────────────────────────────────────────────
    if (action === 'ausencias' && req.method === 'GET') {
      const rows = await sql(`
        SELECT a.id_ausencia, a.id_empleado,
          e.primer_nombre+' '+e.primer_apellido AS empleado,
          a.tipo_ausencia, a.fecha_inicio, a.fecha_fin,
          DATEDIFF(DAY,a.fecha_inicio,a.fecha_fin)+1 AS dias,
          a.estado, a.observaciones
        FROM Ausencia a
        JOIN Empleado e ON a.id_empleado=e.id_empleado
        ORDER BY a.fecha_inicio DESC`);
      resp(200, rows); return;
    }

    // ── Ausencias POST ─────────────────────────────────────────────────────
    if (action === 'ausencias' && req.method === 'POST') {
      const b = req.body;
      const obs = b.observaciones ? `'${b.observaciones.replace(/'/g,"''")}'` : 'NULL';
      await sql(`
        INSERT INTO Ausencia(id_empleado,tipo_ausencia,fecha_inicio,fecha_fin,estado,observaciones)
        VALUES(${parseInt(b.id_empleado)},'${b.tipo_ausencia}',
          '${b.fecha_inicio}','${b.fecha_fin}','PENDIENTE',${obs})`);
      resp(201, { ok: true }); return;
    }

    // ── Ausencias estado PUT ───────────────────────────────────────────────
    if (action === 'ausencias-estado' && req.method === 'PUT') {
      const b = req.body;
      await sql(`UPDATE Ausencia SET estado='${b.estado}' WHERE id_ausencia=${parseInt(b.id_ausencia)}`);
      resp(200, { ok: true }); return;
    }

    resp(404, { error: 'Ruta no encontrada: ' + action });

  } catch(err) {
    resp(500, { error: err.message });
  }
};
