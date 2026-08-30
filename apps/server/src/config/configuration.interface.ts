export type NodeEnvironment = 'development' | 'test' | 'production';

export interface ApplicationConfiguration {
  app: {
    nodeEnv: NodeEnvironment;
    port: number;
    corsOrigin: string;
    swaggerEnabled: boolean;
  };
  database: {
    url: string;
  };
  auth: {
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
  mail: {
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
