import * as core from '@actions/core';
import * as github from '@actions/github';
import fetch from 'node-fetch';

async function run() {
  try {
    const user = core.getInput('user');
    const source = core.getInput('source');
    const audience = core.getInput('audience') || 'api.nuget.org';

    // Step 1: Get OIDC token
    const idToken = await core.getIDToken(audience);
    if (!idToken) throw new Error('Failed to retrieve OIDC token');

    core.info(`Retrieved OIDC token for audience: ${audience}`);

    // Step 2: Discover TokenService endpoint from NuGet V3 index
    const res = await fetch(source);
    const index = await res.json();
    const tokenService = index.resources.find((r: any) =>
      r['@type'] === 'TokenService/1.0.0');

    if (!tokenService?.['@id']) {
      throw new Error('TokenService/1.0.0 endpoint not found in service index');
    }

    const tokenUrl = tokenService['@id'];
    core.info(`Discovered token endpoint: ${tokenUrl}`);

    // Step 3: Exchange OIDC token for NuGet API key
    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: idToken,
        username: user
      })
    });

    if (!tokenResponse.ok) {
      throw new Error(`Token exchange failed: ${tokenResponse.status} ${tokenResponse.statusText}`);
    }

    const { apiKey } = await tokenResponse.json();

    if (!apiKey) throw new Error('No API key returned by NuGet token service');

    core.setSecret(apiKey);  // Mask in logs
    core.setOutput('NUGET_API_KEY', apiKey);

    core.info('NuGet API key retrieved and set as output');

  } catch (error) {
    core.setFailed((error as Error).message);
  }
}

run();
