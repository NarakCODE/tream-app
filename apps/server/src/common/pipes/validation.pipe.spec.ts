import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AppValidationPipe } from './validation.pipe';

class NestedDto {
  @IsOptional() @IsString() absent?: string;
  @IsOptional() @IsString() clear?: string | null;
}
class PatchDto {
  @IsOptional() @IsString() absent?: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsInt() count?: number;
  @IsOptional() @ValidateNested() @Type(() => NestedDto) nested?: NestedDto;
}
describe('AppValidationPipe optional fields', () => {
  const pipe = new AppValidationPipe();
  const metadata = { type: 'body' as const, metatype: PatchDto };
  it('removes omitted constructor fields while preserving false, zero and explicit null', async () => {
    const result = await pipe.transform(
      { enabled: false, count: 0, nested: { clear: null } },
      metadata,
    );
    expect(result).toEqual({
      enabled: false,
      count: 0,
      nested: { clear: null },
    });
    expect(Object.keys(result as object)).toEqual([
      'enabled',
      'count',
      'nested',
    ]);
    expect(result).toBeInstanceOf(PatchDto);
  });
  it('keeps an empty patch empty rather than inventing changes', async () => {
    expect(await pipe.transform({}, metadata)).toEqual({});
  });
  it('still rejects unknown properties before pruning', async () => {
    await expect(
      pipe.transform({ unknown: 'value' }, metadata),
    ).rejects.toThrow();
  });
});
