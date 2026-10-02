// No npm packages required. Serves only classroom assets, never repository files.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const dgram = require('node:dgram');
const {execFile} = require('node:child_process');

async function localAddress() {
  return new Promise(resolve => {
    const probe = dgram.createSocket('udp4');
    probe.on('error', () => {
      probe.close();
      const addresses = Object.values(os.networkInterfaces()).flat();
      resolve(addresses.find(a => a.family === 'IPv4' && !a.internal)?.address || '127.0.0.1');
    });
    // UDP connect selects a route without transmitting a packet.
    probe.connect(80, '1.1.1.1', () => {
      const address = probe.address().address;
      probe.close();
      resolve(address);
    });
  });
}

function createServer() {
  return http.createServer((req, res) => {
    let name;
    try { name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
    catch { res.writeHead(400).end(); return; }
    if (name === '/') name = '/index.html';
    const allowed = ['/index.html', '/포켓몬_소수의나눗셈.html',
      '/소수의_나눗셈_문장제_5선.html', '/process-quizzes.js', '/guided-practice.js', '/classroom-adventure.js', '/adventure.css', '/vendor/paho-mqtt-1.1.0.min.js', '/vendor/qrcode-1.0.0.min.js',
      '/student.html','/question-manager.html','/question-manager.css','/question-manager.js','/course-library.js','/classroom-courses.js','/questions/social-6-2-1.js'];
    const voiceAsset = /^\/assets\/voice\/(?:manifest\.json|[a-f0-9]{16}\.wav)$/.test(name);
    if ((!allowed.includes(name) && !voiceAsset) || !['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(404).end(); return;
    }
    fs.readFile(path.join(__dirname, name.slice(1)), (error, content) => {
      if (error) { res.writeHead(404).end(); return; }
      res.writeHead(200, {'Content-Type': name.endsWith('.js') ? 'text/javascript; charset=utf-8' : name.endsWith('.css') ? 'text/css; charset=utf-8' : name.endsWith('.wav') ? 'audio/wav' : name.endsWith('.json') ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8',
        'Cache-Control': 'no-store'});
      res.end(req.method === 'HEAD' ? undefined : content);
    });
  });
}

async function start() {
  const ip = await localAddress();
  const server = createServer();
  let port = 8200;
  server.on('error', error => {
    if (error.code === 'EADDRINUSE' && port < 8239) server.listen(++port, '0.0.0.0');
    else { console.error('서버 실행 실패:', error.message); process.exitCode = 1; }
  });
  server.on('listening', () => {
    const url = `http://localhost:${port}/index.html?hostIp=${ip}&port=${port}`;
    console.log(`교사용 게임: ${url}\n학생: 교사 화면의 [실시간 학생 참여] QR을 스캔하세요.\n교사와 학생은 같은 교실 Wi-Fi에 연결하세요.\n이 창을 닫으면 게임 파일 서버가 종료됩니다.`);
    if (!process.argv.includes('--no-open') && process.platform === 'win32') {
      execFile('rundll32.exe', ['url.dll,FileProtocolHandler', url], {windowsHide: true}, error => {
        if (error) console.log('위 교사용 주소를 브라우저에서 여세요.');
      });
    }
  });
  server.listen(port, '0.0.0.0');
}

module.exports = {createServer, localAddress};
if (require.main === module) start().catch(error => { console.error(error); process.exitCode = 1; });
