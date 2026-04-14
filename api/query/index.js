const sql = require('mssql');

const config = {
  server:   process.env.SQL_SERVER,
  database: process.env.SQL_DATABASE,
  user:     process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  options:  { encrypt: true, trustServerCertificate: false }
};

let pool = null;
async function getPool() {
  if (!pool) pool = await sql.connect(config);
  return pool;
}

module.exports = async function (context, req) {
  context.res = { headers: { 'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type' }};

  if (req.method === 'OPTIONS') { context.res.status = 200; context.res.body = ''; return; }

  const action = req.params.action;

  try {
    const db = await getPool();

    // ── GET empleados ──────────────────────────────────────────────────────
    if (action === 'empleados' && req.method === 'GET') {
      const result = await db.request().query(`
        SELECT e.id_empleado, e.primer_nombre+' '+e.primer_apellido AS nombre,
          e.num_identificacion AS nid, e.email_corporativo AS email,
          e.telefono, e.fecha_contratacion, e.tipo_contrato,
          e.salario_actual AS salario, e.activo,
          d.nombre_departamento AS depto, c.nombre_cargo AS cargo,
          e.id_departamento, e.id_cargo
        FROM Empleado e
        JOIN Departamento d ON e.id_departamento=d.id_departamento
        JOIN Cargo c ON e.id_cargo=c.id_cargo
        WHERE e.activo=1
        ORDER BY e.primer_apellido`);
      context.res.status = 200;
      context.res.body = JSON.stringify(result.recordset);
      return;
    }

    // ── POST empleado (INSERT con parámetros — anti SQL Injection) ─────────
    if (action === 'empleados' && req.method === 'POST') {
      const b = req.body;
      if (!b.primer_nombre || !b.primer_apellido || !b.num_identificacion || !b.email_corporativo)
        throw new Error('Faltan campos obligatorios');

      const r = db.request();
      // ► Todos los valores van como parámetros tipados — nunca concatenados
      r.input('primer_nombre',      sql.NVarChar(60),  b.primer_nombre);
      r.input('primer_apellido',    sql.NVarChar(60),  b.primer_apellido);
      r.input('num_identificacion', sql.NVarChar(20),  b.num_identificacion);
      r.input('tipo_identificacion',sql.NVarChar(10),  b.tipo_identificacion || 'CC');
      r.input('fecha_nacimiento',   sql.Date,          b.fecha_nacimiento);
      r.input('genero',             sql.Char(1),       b.genero || 'M');
      r.input('email_corporativo',  sql.NVarChar(120), b.email_corporativo);
      r.input('telefono',           sql.NVarChar(20),  b.telefono || null);
      r.input('fecha_contratacion', sql.Date,          b.fecha_contratacion || new Date());
      r.input('tipo_contrato',      sql.NVarChar(30),  b.tipo_contrato || 'INDEFINIDO');
      r.input('salario_actual',     sql.Decimal(14,2), parseFloat(b.salario_actual));
      r.input('id_departamento',    sql.Int,           parseInt(b.id_departamento));
      r.input('id_cargo',           sql.Int,           parseInt(b.id_cargo));

      await r.query(`
        INSERT INTO Empleado
          (primer_nombre,primer_apellido,num_identificacion,tipo_identificacion,
           fecha_nacimiento,genero,email_corporativo,telefono,
           fecha_contratacion,tipo_contrato,salario_actual,id_departamento,id_cargo)
        VALUES
          (@primer_nombre,@primer_apellido,@num_identificacion,@tipo_identificacion,
           @fecha_nacimiento,@genero,@email_corporativo,@telefono,
           @fecha_contratacion,@tipo_contrato,@salario_actual,@id_departamento,@id_cargo)`);

      context.res.status = 201;
      context.res.body = JSON.stringify({ ok: true, mensaje: 'Empleado creado' });
      return;
    }

    // ── PUT empleado (UPDATE con parámetros) ───────────────────────────────
    if (action === 'empleados' && req.method === 'PUT') {
      const b = req.body;
      const r = db.request();
      r.input('id',          sql.Int,           parseInt(b.id_empleado));
      r.input('nombre',      sql.NVarChar(60),  b.primer_nombre);
      r.input('apellido',    sql.NVarChar(60),  b.primer_apellido);
      r.input('email',       sql.NVarChar(120), b.email_corporativo);
      r.input('telefono',    sql.NVarChar(20),  b.telefono || null);
      r.input('salario',     sql.Decimal(14,2), parseFloat(b.salario_actual));
      r.input('contrato',    sql.NVarChar(30),  b.tipo_contrato);
      r.input('id_depto',    sql.Int,           parseInt(b.id_departamento));
      r.input('id_cargo',    sql.Int,           parseInt(b.id_cargo));

      await r.query(`
        UPDATE Empleado SET
          primer_nombre=@nombre, primer_apellido=@apellido,
          email_corporativo=@email, telefono=@telefono,
          salario_actual=@salario, tipo_contrato=@contrato,
          id_departamento=@id_depto, id_cargo=@id_cargo
        WHERE id_empleado=@id AND activo=1`);

      context.res.status = 200;
      context.res.body = JSON.stringify({ ok: true, mensaje: 'Empleado actualizado' });
      return;
    }

    // ── DELETE empleado (baja lógica) ──────────────────────────────────────
    if (action === 'empleados' && req.method === 'DELETE') {
      const id = parseInt(req.query.id);
      const r  = db.request();
      r.input('id', sql.Int, id);
      await r.query(`UPDATE Empleado SET activo=0 WHERE id_empleado=@id`);
      context.res.status = 200;
      context.res.body = JSON.stringify({ ok: true, mensaje: 'Empleado dado de baja' });
      return;
    }

    // ── GET nóminas ────────────────────────────────────────────────────────
    if (action === 'nominas' && req.method === 'GET') {
      const estado = req.query.estado || null;
      const r = db.request();
      r.input('estado', sql.NVarChar(20), estado);
      const result = await r.query(`
        SELECT n.id_nomina, n.id_empleado,
          e.primer_nombre+' '+e.primer_apellido AS empleado,
          n.anio, n.mes, n.salario_base, n.dias_trabajados,
          n.total_devengado, n.total_deducciones, n.neto_pagado,
          n.fecha_pago, n.estado
        FROM Nomina n
        JOIN Empleado e ON n.id_empleado=e.id_empleado
        WHERE (@estado IS NULL OR n.estado=@estado)
        ORDER BY n.anio DESC, n.mes DESC`);
      context.res.status = 200;
      context.res.body = JSON.stringify(result.recordset);
      return;
    }

    // ── POST nómina ────────────────────────────────────────────────────────
    if (action === 'nominas' && req.method === 'POST') {
      const b = req.body;
      const r = db.request();
      r.input('id_empleado',      sql.Int,           parseInt(b.id_empleado));
      r.input('anio',             sql.SmallInt,      parseInt(b.anio));
      r.input('mes',              sql.TinyInt,       parseInt(b.mes));
      r.input('salario_base',     sql.Decimal(14,2), parseFloat(b.salario_base));
      r.input('dias_trabajados',  sql.TinyInt,       parseInt(b.dias_trabajados)||30);
      r.input('total_devengado',  sql.Decimal(14,2), parseFloat(b.total_devengado)||0);
      r.input('total_deducciones',sql.Decimal(14,2), parseFloat(b.total_deducciones)||0);
      r.input('neto_pagado',      sql.Decimal(14,2), parseFloat(b.neto_pagado)||0);

      await r.query(`
        INSERT INTO Nomina
          (id_empleado,anio,mes,salario_base,dias_trabajados,
           total_devengado,total_deducciones,neto_pagado,estado)
        VALUES
          (@id_empleado,@anio,@mes,@salario_base,@dias_trabajados,
           @total_devengado,@total_deducciones,@neto_pagado,'BORRADOR')`);

      context.res.status = 201;
      context.res.body = JSON.stringify({ ok: true });
      return;
    }

    // ── PUT estado nómina ──────────────────────────────────────────────────
    if (action === 'nominas-estado' && req.method === 'PUT') {
      const b = req.body;
      const r = db.request();
      r.input('id',     sql.Int,          parseInt(b.id_nomina));
      r.input('estado', sql.NVarChar(20), b.estado);
      await r.query(`
        UPDATE Nomina SET estado=@estado,
          fecha_pago=CASE WHEN @estado='PAGADA' THEN CAST(GETDATE() AS DATE) ELSE fecha_pago END
        WHERE id_nomina=@id`);
      context.res.status = 200;
      context.res.body = JSON.stringify({ ok: true });
      return;
    }

    // ── GET ausencias ──────────────────────────────────────────────────────
    if (action === 'ausencias' && req.method === 'GET') {
      const result = await db.request().query(`
        SELECT a.id_ausencia, a.id_empleado,
          e.primer_nombre+' '+e.primer_apellido AS empleado,
          a.tipo_ausencia, a.fecha_inicio, a.fecha_fin,
          DATEDIFF(DAY,a.fecha_inicio,a.fecha_fin)+1 AS dias,
          a.estado, a.observaciones
        FROM Ausencia a
        JOIN Empleado e ON a.id_empleado=e.id_empleado
        ORDER BY a.fecha_inicio DESC`);
      context.res.status = 200;
      context.res.body = JSON.stringify(result.recordset);
      return;
    }

    // ── POST ausencia ──────────────────────────────────────────────────────
    if (action === 'ausencias' && req.method === 'POST') {
      const b = req.body;
      const r = db.request();
      r.input('id_empleado',  sql.Int,          parseInt(b.id_empleado));
      r.input('tipo',         sql.NVarChar(30), b.tipo_ausencia);
      r.input('inicio',       sql.Date,         b.fecha_inicio);
      r.input('fin',          sql.Date,         b.fecha_fin);
      r.input('obs',          sql.NVarChar(400),b.observaciones||null);
      await r.query(`
        INSERT INTO Ausencia (id_empleado,tipo_ausencia,fecha_inicio,fecha_fin,estado,observaciones)
        VALUES (@id_empleado,@tipo,@inicio,@fin,'PENDIENTE',@obs)`);
      context.res.status = 201;
      context.res.body = JSON.stringify({ ok: true });
      return;
    }

    // ── PUT estado ausencia ────────────────────────────────────────────────
    if (action === 'ausencias-estado' && req.method === 'PUT') {
      const b = req.body;
      const r = db.request();
      r.input('id',     sql.Int,          parseInt(b.id_ausencia));
      r.input('estado', sql.NVarChar(20), b.estado);
      await r.query(`UPDATE Ausencia SET estado=@estado WHERE id_ausencia=@id`);
      context.res.status = 200;
      context.res.body = JSON.stringify({ ok: true });
      return;
    }

    // ── GET catálogos ──────────────────────────────────────────────────────
    if (action === 'catalogos' && req.method === 'GET') {
      const deptos  = await db.request().query(`SELECT id_departamento AS id, nombre_departamento AS nombre FROM Departamento WHERE activo=1`);
      const cargos  = await db.request().query(`SELECT id_cargo AS id, nombre_cargo AS nombre FROM Cargo`);
      const empList = await db.request().query(`SELECT id_empleado AS id, primer_nombre+' '+primer_apellido AS nombre FROM Empleado WHERE activo=1`);
      context.res.status = 200;
      context.res.body = JSON.stringify({
        departamentos: deptos.recordset,
        cargos:        cargos.recordset,
        empleados:     empList.recordset
      });
      return;
    }

    context.res.status = 404;
    context.res.body = JSON.stringify({ error: 'Ruta no encontrada' });

  } catch (err) {
    context.res.status = 500;
    context.res.body = JSON.stringify({ error: err.message });
  }
};
