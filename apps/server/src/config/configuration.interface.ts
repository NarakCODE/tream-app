export type NodeEnvironment = 'development' | 'test' | 'production';

export interface ApplicationConfiguration {
  app: {
    nodeEnv: NodeEnvironment;
    port: number;
    corsOrigin: string;
    swaggerEnabled: boolean;
  };
}
