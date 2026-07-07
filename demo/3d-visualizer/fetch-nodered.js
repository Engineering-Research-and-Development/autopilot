const http = require('https');
http.get('http://localhost:1880/autopilot/ui', (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => { console.log(data); });
}).on('error', (err) => { console.log("Error: " + err.message); });
