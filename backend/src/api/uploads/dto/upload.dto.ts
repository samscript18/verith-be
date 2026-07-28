import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsMongoId, IsString, Min } from 'class-validator';
import { AssetType } from '../enums/asset-type.enum';

export class CreateUploadSignatureDto {
  @ApiProperty({ enum: AssetType })
  @IsEnum(AssetType)
  assetType!: AssetType;
}

export class ConfirmUploadDto {
  @ApiProperty()
  @IsMongoId()
  assetId!: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  version!: number;

  @ApiProperty()
  @IsString()
  signature!: string;
}
