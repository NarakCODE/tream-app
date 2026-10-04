import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ApplicationConfiguration } from '../../../config/configuration.interface';
import { ObjectStorage } from '../domain/object-storage.port';
import { ContentScanner } from '../domain/content-scanner.port';
import { FileGrant } from '../domain/file-grant.port';
import { FilesystemObjectStorage } from './storage/filesystem-object-storage';
import { S3ObjectStorage } from './storage/s3-object-storage';
import { ClamavContentScanner } from './scanning/clamav-content-scanner';
import { DevelopmentContentScanner } from './scanning/development-content-scanner';
import { FileGrantSigner } from './file-grant-signer';
@Module({
  providers: [
    {
      provide: ObjectStorage,
      inject: [ConfigService],
      useFactory: (config: ConfigService<ApplicationConfiguration, true>) => {
        const files = config.getOrThrow('files', { infer: true });
        return files.storageDriver === 'filesystem'
          ? new FilesystemObjectStorage({
              rootDirectory: files.localRoot,
              maxFileBytes: files.maxFileBytes,
            })
          : new S3ObjectStorage({
              bucket: files.bucket,
              region: files.region,
              maxFileBytes: files.maxFileBytes,
              ioTimeoutMs: Math.min(
                3000,
                Math.max(
                  1,
                  Math.floor(
                    config.getOrThrow('database.queryTimeoutMs', {
                      infer: true,
                    }) / 3,
                  ),
                ),
              ),
              ...(files.endpoint ? { endpoint: files.endpoint } : {}),
              ...(files.accessKey ? { accessKey: files.accessKey } : {}),
              ...(files.secretKey ? { secretKey: files.secretKey } : {}),
            });
      },
    },
    {
      provide: ContentScanner,
      inject: [ConfigService],
      useFactory: (config: ConfigService<ApplicationConfiguration, true>) => {
        const files = config.getOrThrow('files', { infer: true });
        return files.scannerDriver === 'clamav'
          ? new ClamavContentScanner({
              host: files.clamavHost,
              port: files.clamavPort,
              timeoutMs: files.scanTimeoutMs,
              maxFileBytes: files.maxFileBytes,
            })
          : new DevelopmentContentScanner(
              config.getOrThrow('app.nodeEnv', { infer: true }),
            );
      },
    },
    {
      provide: FileGrantSigner,
      inject: [ConfigService],
      useFactory: (config: ConfigService<ApplicationConfiguration, true>) =>
        new FileGrantSigner(config.getOrThrow('files', { infer: true })),
    },
    { provide: FileGrant, useExisting: FileGrantSigner },
  ],
  exports: [ObjectStorage, ContentScanner, FileGrantSigner, FileGrant],
})
export class FileProvidersModule {}
