const http=require('http'),fs=require('fs'),path=require('path'),{exec}=require('child_process');
const root=__dirname,port=8133;
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/manifest+json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'};
http.createServer((req,res)=>{let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname)}catch{res.writeHead(400);return res.end('Bad request')}
let file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+path.sep)&&file!==root){res.writeHead(403);return res.end('Forbidden')}
if(pathname.endsWith('/'))file=path.join(file,'index.html');
fs.readFile(file,(err,data)=>{if(err){res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});return res.end('Файл не найден')}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':path.basename(file)==='service-worker.js'?'no-cache':'public, max-age=0'});res.end(data)})}).listen(port,'127.0.0.1',()=>{console.log('FinBuddy PWA: http://127.0.0.1:'+port);if(process.env.OPEN_BROWSER!=='0')exec('start "" http://127.0.0.1:'+port)})
