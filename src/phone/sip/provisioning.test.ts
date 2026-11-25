import { describe, expect, test } from 'bun:test'
import {
  extractProvisioningUrls,
  fetchProvisioningUrl,
  parseProvisioningPayload,
  resolveProvisioningInput,
  unwrapProvisioningUrl,
  type Fetcher,
} from './provisioning'

describe('标准 SIP 配网导入', () => {
  test('解析标准 /api/v1/provisioning?format=json 响应（单/多账号 + WSS + HA1）', () => {
    const json = JSON.stringify({
      sip_username: '+15550000001',
      authorization_username: '+15550000001',
      ha1: '8a4f2c9012e34b567890abcdef123456',
      domain: '198.51.100.10',
      realm: '198.51.100.10',
      sip_proxy: '<sip:198.51.100.10:5061;transport=tls>',
      transport: 'tls',
      websocket_url: 'wss://198.51.100.10:8465/sip',
      registration_expires_seconds: 300,
      accounts: [
        {
          slot: 0,
          sip_username: '+15550000001',
          authorization_username: '+15550000001',
          ha1: '8a4f2c9012e34b567890abcdef123456',
          domain: '198.51.100.10',
          realm: '198.51.100.10',
        },
        {
          slot: 1,
          sip_username: 'c2_15550000002',
          authorization_username: 'c2_15550000002',
          ha1: '11112222333344445555666677778888',
          domain: '198.51.100.10',
          realm: '198.51.100.10',
        },
      ],
    })

    const res = parseProvisioningPayload(json)
    expect(res.websocketUrl).toBe('wss://198.51.100.10:8465/sip')
    expect(res.registrationExpiresSeconds).toBe(300)
    expect(res.accounts).toEqual([
      {
        slot: 0,
        username: '+15550000001',
        domain: '198.51.100.10',
        realm: '198.51.100.10',
        ha1: '8a4f2c9012e34b567890abcdef123456',
      },
      {
        slot: 1,
        username: 'c2_15550000002',
        domain: '198.51.100.10',
        realm: '198.51.100.10',
        ha1: '11112222333344445555666677778888',
      },
    ])
  })

  test('解析内嵌 xml 的配网签发 JSON 响应并保留 websocket_url', () => {
    const bundle = JSON.stringify({
      sip_username: '+15550000001',
      domain: 'sip.example.invalid',
      websocket_url: 'wss://sip.example.invalid:8465/sip',
      registration_expires_seconds: 300,
      xml: `<?xml version="1.0" encoding="UTF-8"?>
<config xmlns="http://www.linphone.org/xsds/lpconfig.xsd">
  <section name="auth_info_2" overwrite="true">
    <entry name="username" overwrite="true">+15550000001</entry>
    <entry name="ha1" overwrite="true">ABCDEF0123456789ABCDEF0123456789</entry>
    <entry name="realm" overwrite="true">sip.example.invalid</entry>
    <entry name="domain" overwrite="true">sip.example.invalid</entry>
  </section>
  <section name="proxy_2" overwrite="true">
    <entry name="reg_proxy" overwrite="true">&lt;sip:sip.example.invalid:5061;transport=tls&gt;</entry>
    <entry name="reg_expires" overwrite="true">300</entry>
  </section>
</config>`,
    })

    const res = parseProvisioningPayload(bundle)
    expect(res.websocketUrl).toBe('wss://sip.example.invalid:8465/sip')
    expect(res.sipProxy).toBe('<sip:sip.example.invalid:5061;transport=tls>')
    expect(res.accounts).toEqual([
      {
        slot: 2,
        username: '+15550000001',
        domain: 'sip.example.invalid',
        realm: 'sip.example.invalid',
        ha1: 'abcdef0123456789abcdef0123456789',
      },
    ])
  })

  test('解析 Linphone XML 与 linphonerc INI 文本，并在 HTTPS hint 下推导 WSS 入口', () => {
    const ini = `
[auth_info_0]
username=+15550000003
ha1=00112233445566778899aabbccddeeff
realm=webrtc.local
domain=webrtc.local

[proxy_0]
reg_proxy=<sip:webrtc.local:5061;transport=tls>
reg_expires=300
`
    const res = parseProvisioningPayload(ini, 'https://198.51.100.10:8465/api/v1/provisioning/tok')
    expect(res.websocketUrl).toBe('wss://198.51.100.10:8465/sip')
    expect(res.registrationExpiresSeconds).toBe(300)
    expect(res.accounts[0]).toEqual({
      slot: 0,
      username: '+15550000003',
      domain: 'webrtc.local',
      realm: 'webrtc.local',
      ha1: '00112233445566778899aabbccddeeff',
    })
  })

  test('拉取远程配网 URL 时自动附加 format=json 并映射错误状态码', async () => {
    let seenUrl = ''
    const okFetch: Fetcher = async input => {
      seenUrl = String(input)
      return new Response(JSON.stringify({
        sip_username: '+15550000001',
        ha1: '8a4f2c9012e34b567890abcdef123456',
        domain: 'example.invalid',
        websocket_url: 'wss://example.invalid/sip',
      }), { status: 200 })
    }

    const res = await fetchProvisioningUrl('https://example.invalid/api/v1/provisioning/token123', okFetch)
    expect(seenUrl).toBe('https://example.invalid/api/v1/provisioning/token123?format=json')
    expect(res.accounts[0].ha1).toBe('8a4f2c9012e34b567890abcdef123456')

    const expiredFetch: Fetcher = async () => new Response('', { status: 410 })
    await expect(fetchProvisioningUrl('https://example.invalid/api/v1/provisioning/t', expiredFetch)).rejects.toThrow('已过期')

    const deniedFetch: Fetcher = async () => { throw new TypeError('Failed to fetch') }
    await expect(fetchProvisioningUrl('https://example.invalid/api/v1/provisioning/t', deniedFetch)).rejects.toThrow('XML / linphonerc')
  })

  test('可选读取 JSON 配网中的 label 与 group 号码组字段', () => {
    const res = parseProvisioningPayload(JSON.stringify({
      domain: 'webrtc.local',
      group: '外呼一组',
      accounts: [
        { slot: 0, sip_username: '+15550000010', ha1: '8a4f2c9012e34b567890abcdef123456', label: '主线' },
        { slot: 1, sip_username: '+15550000011', ha1: '11112222333344445555666677778888', label: 'VIP', group: 'VIP组' },
      ],
    }))
    expect(res.accounts[0].label).toBe('主线')
    expect(res.accounts[0].group).toBe('外呼一组')
    expect(res.accounts[1].label).toBe('VIP')
    expect(res.accounts[1].group).toBe('VIP组')
  })

  test('解析多客户端绑定的 number / reg_identity 外显号码，以及 linphone-config 与多链接批量解析', async () => {
    const jsonRes = parseProvisioningPayload(JSON.stringify({
      domain: 'webrtc.local',
      accounts: [
        {
          slot: 0,
          sip_username: 'c_abc123def456',
          number: '+15550000101',
          domain: 'webrtc.local',
          ha1: '8a4f2c9012e34b567890abcdef123456',
          label: '主线',
        },
      ],
    }))
    expect(jsonRes.accounts[0].phoneNumber).toBe('+15550000101')

    const iniRes = parseProvisioningPayload(`
[auth_info_0]
username=c_ini_1
ha1=00112233445566778899aabbccddeeff
domain=webrtc.local

[proxy_0]
reg_proxy=<sip:webrtc.local:5061;transport=tls>
reg_identity="+15550000202" <sip:c_ini_1@webrtc.local>
`)
    expect(iniRes.accounts[0].phoneNumber).toBe('+15550000202')

    expect(unwrapProvisioningUrl('linphone-config:https://example.invalid/p/1')).toBe('https://example.invalid/p/1')
    expect(extractProvisioningUrls('linphone-config:https://example.invalid/p/1\nhttps://example.invalid/p/2\nhttps://example.invalid/p/1')).toEqual([
      'https://example.invalid/p/1',
      'https://example.invalid/p/2',
    ])

    const batchFetcher: Fetcher = async input => {
      const url = String(input)
      if (url.includes('p/bad')) return new Response('', { status: 410 })
      return new Response(JSON.stringify({
        sip_username: 'c_batch_1',
        number: '+15550000303',
        domain: 'example.invalid',
        ha1: '8a4f2c9012e34b567890abcdef123456',
        websocket_url: 'wss://example.invalid/sip',
      }), { status: 200 })
    }
    const resolved = await resolveProvisioningInput(
      'https://example.invalid/p/1\nhttps://example.invalid/p/bad',
      batchFetcher,
    )
    expect(resolved.result.accounts).toHaveLength(1)
    expect(resolved.result.accounts[0].phoneNumber).toBe('+15550000303')
    expect(resolved.failures).toHaveLength(1)
    expect(resolved.failures[0]).toContain('已过期')
  })
})
