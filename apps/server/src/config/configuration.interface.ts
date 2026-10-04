export type NodeEnvironment = 'development' | 'test' | 'production';

export interface ApplicationConfiguration {
  app: {
    nodeEnv: NodeEnvironment;
    port: number;
    corsOrigin: string;
    swaggerEnabled: boolean;
    trustProxyHops: number;
    backgroundWorkersEnabled: boolean;
  };
  database: {
    url: string;
    maxPool: number;
    connectionTimeoutMs: number;
    queryTimeoutMs: number;
  };
  auth: {
    mailEncryptionKey: string;
    jwt: {
      issuer: string;
      audience: string;
      accessSecret: string;
      accessTtl: string;
      refreshTtl: string;
    };
    magicLink: {
      ttl: string;
      baseUrl: string;
    };
  };
  files: {
    storageDriver: 'filesystem' | 's3';
    localRoot: string;
    bucket: string;
    endpoint?: string;
    region: string;
    accessKey?: string;
    secretKey?: string;
    scannerDriver: 'development' | 'clamav';
    clamavHost: string;
    clamavPort: number;
    scanTimeoutMs: number;
    maxFileBytes: number;
    workspaceQuotaBytes: number;
    uploadIntentTtlSeconds: number;
    uploadGrantTtlSeconds: number;
    downloadGrantTtlSeconds: number;
    retentionDays: number;
    cleanupLeaseSeconds: number;
    cleanupMaxAttempts: number;
    signingSecret: string;
  };
  mail: {
    provider: 'smtp' | 'resend';
    resend: {
      apiKey?: string;
      from: string;
    };
    smtp: {
      host: string;
      port: number;
      secure: boolean;
      user?: string;
      password?: string;
      from: string;
    };
  };
}
