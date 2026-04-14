
const { Connection, Request, TYPES } = require('tedious');

function getConn() {
  return new Connection({
    server: process.env.SQL_SERVER,
    authentication: { type:'default', options:{ userName:process.env.SQL_USER, password:process.env.SQL_PASSWORD } },
    options: { database:process.env.SQL_DATABASE, encrypt:true, trustServerCertificate:false, rowCollectionOnRequestCompletion:true }
  });
}

function query(sql, params=[]) {
  return new Promise((resolve,reject)=>{
    const conn=getConn();
    conn.on('connect',err=>{
      if(err) return reject(err);
      const req=new Request(sql,(err,_,columns)=>{
        conn.close();
        if(err) return reject(err);
        resolve(columns.map(row=>{ const o={}; row.forEach(c=>{ o[c.metadata.colName]=c.value; }); return o; }));
      });
      params.forEach(p=>req.addParameter(p.name,p.type,p.value));
      conn.execSql(req);
    });
    conn.connect();
  });
}

function resp(context,status,body){
  context.res={ status, headers:{ 'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS','Access-Control-Allow-Headers':'Content-Type' }, body:JSON.stringify(body) };
}

module.exports = async function(context,req){
  if(req.method==='OPTIONS'){resp(context,200,'');return;}
  const action=req.params.action;
  try{
    if(action==='catalogos'){
      const [deptos,cargos,emps]=await Promise.all([
        query(`SELECT id_departamento AS id,nombre_departamento AS nombre FROM Departamento WHERE activo=1`),
        query(`SELECT id_cargo AS id,nombre_cargo AS nombre FROM Cargo`),
        query(`SELECT id_empleado AS id,primer_nombre+' '+primer_apellido AS nombre FROM Empleado WHERE activo=1`)
      ]);
      resp(context,200,{departamentos:deptos,cargos,empleados:emps});return;
    }
    if(action==='empleados'&&req.method==='GET'){
      const rows=await query(`SELECT e.id_empleado,e.primer_nombre+' '+e.primer_apellido AS nombre,e.num_identificacion AS nid,e.email_corporativo AS email,e.telefono,e.fecha_contratacion,e.tipo_contrato,e.salario_actual AS salario,e.activo,d.nombre_departamento AS depto,c.nombre_cargo AS cargo,e.id_departamento,e.id_cargo FROM Empleado e JOIN Departamento d ON e.id_departamento=d.id_departamento JOIN Cargo c ON e.id_cargo=c.id_cargo WHERE e.activo=1 ORDER BY e.primer_apellido`);
      resp(context,200,rows);return;
    }
    if(action==='empleados'&&req.method==='POST'){
      const b=req.body;
      await query(`INSERT INTO Empleado(primer_nombre,primer_apellido,num_identificacion,tipo_identificacion,fecha_nacimiento,genero,email_corporativo,telefono,fecha_contratacion,tipo_contrato,salario_actual,id_departamento,id_cargo)VALUES(@pn,@pa,@nid,@tid,@fn,@gen,@email,@tel,@fc,@tc,@sal,@dep,@car)`,[
        {name:'pn',type:TYPES.NVarChar,value:b.primer_nombre},{name:'pa',type:TYPES.NVarChar,value:b.primer_apellido},
        {name:'nid',type:TYPES.NVarChar,value:b.num_identificacion},{name:'tid',type:TYPES.NVarChar,value:b.tipo_identificacion||'CC'},
        {name:'fn',type:TYPES.Date,value:new Date(b.fecha_nacimiento)},{name:'gen',type:TYPES.Char,value:b.genero||'M'},
        {name:'email',type:TYPES.NVarChar,value:b.email_corporativo},{name:'tel',type:TYPES.NVarChar,value:b.telefono||null},
        {name:'fc',type:TYPES.Date,value:new Date(b.fecha_contratacion||new Date())},{name:'tc',type:TYPES.NVarChar,value:b.tipo_contrato||'INDEFINIDO'},
        {name:'sal',type:TYPES.Decimal,value:parseFloat(b.salario_actual)},{name:'dep',type:TYPES.Int,value:parseInt(b.id_departamento)},{name:'car',type:TYPES.Int,value:parseInt(b.id_cargo)}
      ]);
      resp(context,201,{ok:true});return;
    }
    if(action==='empleados'&&req.method==='PUT'){
      const b=req.body;
      await query(`UPDATE Empleado SET primer_nombre=@pn,primer_apellido=@pa,email_corporativo=@email,telefono=@tel,salario_actual=@sal,tipo_contrato=@tc,id_departamento=@dep,id_cargo=@car WHERE id_empleado=@id AND activo=1`,[
        {name:'id',type:TYPES.Int,value:parseInt(b.id_empleado)},{name:'pn',type:TYPES.NVarChar,value:b.primer_nombre},
        {name:'pa',type:TYPES.NVarChar,value:b.primer_apellido},{name:'email',type:TYPES.NVarChar,value:b.email_corporativo},
        {name:'tel',type:TYPES.NVarChar,value:b.telefono||null},{name:'sal',type:TYPES.Decimal,value:parseFloat(b.salario_actual)},
        {name:'tc',type:TYPES.NVarChar,value:b.tipo_contrato},{name:'dep',type:TYPES.Int,value:parseInt(b.id_departamento)},{name:'car',type:TYPES.Int,value:parseInt(b.id_cargo)}
      ]);
      resp(context,200,{ok:true});return;
    }
    if(action==='empleados'&&req.method==='DELETE'){
      await query(`UPDATE Empleado SET activo=0 WHERE id_empleado=@id`,[{name:'id',type:TYPES.Int,value:parseInt(req.query.id)}]);
      resp(context,200,{ok:true});return;
    }
    if(action==='nominas'&&req.method==='GET'){
      const estado=req.query.estado||null;
      const rows=await query(`SELECT n.id_nomina,n.id_empleado,e.primer_nombre+' '+e.primer_apellido AS empleado,n.anio,n.mes,n.salario_base,n.dias_trabajados,n.total_devengado,n.total_deducciones,n.neto_pagado,n.fecha_pago,n.estado FROM Nomina n JOIN Empleado e ON n.id_empleado=e.id_empleado WHERE(@est IS NULL OR n.estado=@est)ORDER BY n.anio DESC,n.mes DESC`,[{name:'est',type:TYPES.NVarChar,value:estado}]);
      resp(context,200,rows);return;
    }
    if(action==='nominas'&&req.method==='POST'){
      const b=req.body;
      await query(`INSERT INTO Nomina(id_empleado,anio,mes,salario_base,dias_trabajados,total_devengado,total_deducciones,neto_pagado,estado)VALUES(@emp,@anio,@mes,@sal,@dias,@dev,@ded,@neto,'BORRADOR')`,[
        {name:'emp',type:TYPES.Int,value:parseInt(b.id_empleado)},{name:'anio',type:TYPES.SmallInt,value:parseInt(b.anio)},
        {name:'mes',type:TYPES.TinyInt,value:parseInt(b.mes)},{name:'sal',type:TYPES.Decimal,value:parseFloat(b.salario_base)},
        {name:'dias',type:TYPES.TinyInt,value:parseInt(b.dias_trabajados)||30},{name:'dev',type:TYPES.Decimal,value:parseFloat(b.total_devengado)||0},
        {name:'ded',type:TYPES.Decimal,value:parseFloat(b.total_deducciones)||0},{name:'neto',type:TYPES.Decimal,value:parseFloat(b.neto_pagado)||0}
      ]);
      resp(context,201,{ok:true});return;
    }
    if(action==='nominas-estado'&&req.method==='PUT'){
      const b=req.body;
      await query(`UPDATE Nomina SET estado=@est,fecha_pago=CASE WHEN @est='PAGADA' THEN CAST(GETDATE() AS DATE) ELSE fecha_pago END WHERE id_nomina=@id`,[
        {name:'id',type:TYPES.Int,value:parseInt(b.id_nomina)},{name:'est',type:TYPES.NVarChar,value:b.estado}
      ]);
      resp(context,200,{ok:true});return;
    }
    if(action==='ausencias'&&req.method==='GET'){
      const rows=await query(`SELECT a.id_ausencia,a.id_empleado,e.primer_nombre+' '+e.primer_apellido AS empleado,a.tipo_ausencia,a.fecha_inicio,a.fecha_fin,DATEDIFF(DAY,a.fecha_inicio,a.fecha_fin)+1 AS dias,a.estado,a.observaciones FROM Ausencia a JOIN Empleado e ON a.id_empleado=e.id_empleado ORDER BY a.fecha_inicio DESC`);
      resp(context,200,rows);return;
    }
    if(action==='ausencias'&&req.method==='POST'){
      const b=req.body;
      await query(`INSERT INTO Ausencia(id_empleado,tipo_ausencia,fecha_inicio,fecha_fin,estado,observaciones)VALUES(@emp,@tipo,@ini,@fin,'PENDIENTE',@obs)`,[
        {name:'emp',type:TYPES.Int,value:parseInt(b.id_empleado)},{name:'tipo',type:TYPES.NVarChar,value:b.tipo_ausencia},
        {name:'ini',type:TYPES.Date,value:new Date(b.fecha_inicio)},{name:'fin',type:TYPES.Date,value:new Date(b.fecha_fin)},
        {name:'obs',type:TYPES.NVarChar,value:b.observaciones||null}
      ]);
      resp(context,201,{ok:true});return;
    }
    if(action==='ausencias-estado'&&req.method==='PUT'){
      const b=req.body;
      await query(`UPDATE Ausencia SET estado=@est WHERE id_ausencia=@id`,[
        {name:'id',type:TYPES.Int,value:parseInt(b.id_ausencia)},{name:'est',type:TYPES.NVarChar,value:b.estado}
      ]);
      resp(context,200,{ok:true});return;
    }
    resp(context,404,{error:'Ruta no encontrada'});
  }catch(err){
    resp(context,500,{error:err.message});
  }
};
