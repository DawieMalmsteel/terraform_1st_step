const http = require('http');
const os = require('os');

// ============================================================
// Network type detection
// ============================================================
const networkType = process.env.NETWORK_TYPE || 'unknown';

// ============================================================
// HTTP Server
// ============================================================
const server = http.createServer(async (req, res) => {
  const url = req.url;

  try {
    // Health check
    if (url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        container: os.hostname(),
        network_type: networkType,
        timestamp: new Date().toISOString()
      }));
      return;
    }

    // Network info
    if (url === '/networks') {
      const interfaces = os.networkInterfaces();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        container: os.hostname(),
        network_type: networkType,
        interfaces: interfaces,
        comparison: {
          bridge: {
            docker: 'Default bridge network',
            aws: 'VPC + Subnets',
            characteristics: [
              'Containers share host network stack',
              'Port mapping required for external access',
              'Good isolation',
              'Docker manages IP assignment'
            ]
          },
          macvlan: {
            docker: 'Macvlan network',
            aws: 'Dedicated ENI (Elastic Network Interface)',
            characteristics: [
              'Container has own MAC address',
              'Appears as physical device on network',
              'No port mapping needed',
              'Directly accessible from LAN',
              'Better performance (no NAT)'
            ]
          }
        }
      }));
      return;
    }

    // Test connectivity
    if (url === '/test') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        container: os.hostname(),
        network_type: networkType,
        message: `This container is running on ${networkType} network`,
        how_to_test: {
          bridge: 'curl http://localhost:3000 (via port mapping)',
          macvlan: 'curl http://192.168.1.201 (direct IP)'
        }
      }));
      return;
    }

    // Default response
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <h1>🐳 Docker Network Types Demo</h1>
      <h2>Container: ${os.hostname()}</h2>
      <h3>Network Type: ${networkType.toUpperCase()}</h3>

      <h2>Bridge vs Macvlan</h2>
      <table border="1" cellpadding="8">
        <tr>
          <th>Feature</th>
          <th>Bridge</th>
          <th>Macvlan</th>
        </tr>
        <tr>
          <td>IP assignment</td>
          <td>Docker manages</td>
          <td>Static/DHCP on LAN</td>
        </tr>
        <tr>
          <td>Port mapping</td>
          <td>Required</td>
          <td>Not needed</td>
        </tr>
        <tr>
          <td>Performance</td>
          <td>Good</td>
          <td>Better (no NAT)</td>
        </tr>
        <tr>
          <td>Isolation</td>
          <td>Strong</td>
          <td>Less (same LAN)</td>
        </tr>
        <tr>
          <td>Use case</td>
          <td>Development</td>
          <td>Production/legacy</td>
        </tr>
        <tr>
          <td>AWS equivalent</td>
          <td>VPC + Subnets</td>
          <td>Dedicated ENI</td>
        </tr>
      </table>

      <h2>Test endpoints:</h2>
      <ul>
        <li><a href="/health">/health</a> - Health check</li>
        <li><a href="/networks">/networks</a> - Network info</li>
        <li><a href="/test">/test</a> - How to test</li>
      </ul>
    `);
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Network type: ${networkType}`);
  console.log(`Container ID: ${os.hostname()}`);
});
