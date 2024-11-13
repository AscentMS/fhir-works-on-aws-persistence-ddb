/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: Apache-2.0
 */

import { GenericResponse } from '@ascentms/fhir-works-on-aws-interface';
import { GetObjectCommand, PutObjectCommand, ServerSideEncryption } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { S3, FHIR_BINARY_BUCKET, S3_KMS_KEY } from './s3';
import ObjectStorageInterface from './objectStorageInterface';
import ObjectNotFoundError from './ObjectNotFoundError';
import getComponentLogger from '../loggerBuilder';

const logger = getComponentLogger();

const S3ObjectStorageService: ObjectStorageInterface = class {
    static SSE_ALGORITHM = ServerSideEncryption.aws_kms;

    static PRESIGNED_URL_EXPIRATION_IN_SECONDS = 300;

    static async uploadObject(data: string, fileName: string, contentType: string): Promise<GenericResponse> {
        const base64Data = Buffer.from(data, 'base64');

        const params = {
            Bucket: FHIR_BINARY_BUCKET,
            Key: fileName,
            Body: base64Data,
            ContentEncoding: 'base64',
            ContentType: contentType,
            ServerSideEncryption: this.SSE_ALGORITHM,
            SSEKMSKeyId: S3_KMS_KEY,
        };

        try {
            const parallelUploads = new Upload({
                client: S3,
                params: params
            });

            const response = await parallelUploads.done();

            return { message: response.Key ? response.Key : 'undefined' };
        } catch (e) {
            const message = 'Failed uploading binary data to S3';
            logger.error(message, e);
            throw e;
        }
    }

    static async readObject(fileName: string): Promise<GenericResponse> {
        const params = {
            Bucket: FHIR_BINARY_BUCKET,
            Key: fileName,
        };

        try {
            const object = await S3.getObject(params);
            if (object.Body) {
                const base64Data = await object.Body.transformToString('base64');
                return { message: base64Data };
            }
            throw new Error('S3 object body is empty');
        } catch (e) {
            const message = "Can't read object";
            logger.error(message, e);
            throw e;
        }
    }

    static async deleteObject(fileName: string): Promise<GenericResponse> {
        const params = {
            Bucket: FHIR_BINARY_BUCKET,
            Key: fileName,
        };
        logger.info('Delete Params', params);
        await S3.deleteObject(params);
        return { message: '' };
    }

    static async getPresignedPutUrl(fileName: string): Promise<GenericResponse> {
        /*
        const url = await new getSignedUrl('putObject', {
            Bucket: FHIR_BINARY_BUCKET,
            Key: fileName,
            Expires: this.PRESIGNED_URL_EXPIRATION_IN_SECONDS,
            ServerSideEncryption: this.SSE_ALGORITHM,
            SSEKMSKeyId: S3_KMS_KEY,
        });
        */

        const url = await getSignedUrl(
            S3, 
            new PutObjectCommand(
                {
                    Bucket: FHIR_BINARY_BUCKET,
                    Key: fileName,
                    ServerSideEncryption: this.SSE_ALGORITHM,
                    SSEKMSKeyId: S3_KMS_KEY
                }
            ),
            {
                expiresIn: this.PRESIGNED_URL_EXPIRATION_IN_SECONDS,
            }
        );
        return { message: url };
    }

    static async getPresignedGetUrl(fileName: string): Promise<GenericResponse> {
        // Check to see whether S3 file exists
        try {
            await S3.headObject({
                Bucket: FHIR_BINARY_BUCKET,
                Key: fileName,
            });
        } catch (e) {
            logger.error(`File does not exist. FileName: ${fileName} - ${(e as Error).message}`);
            throw new ObjectNotFoundError(fileName);
        }

        try {
            const url = await getSignedUrl(
                S3, 
                new GetObjectCommand(
                    {
                        Bucket: FHIR_BINARY_BUCKET,
                        Key: fileName
                    }
                ),
                {
                    expiresIn: this.PRESIGNED_URL_EXPIRATION_IN_SECONDS,
                }
            );
            return { message: url };
        } catch (e) {
            logger.error('Failed creating presigned S3 GET URL', e);
            throw e;
        }
    }

    static async deleteBasedOnPrefix(prefix: string): Promise<GenericResponse> {
        let token;
        const promises = [];
        do {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const listParams: any = {
                Bucket: FHIR_BINARY_BUCKET,
                Prefix: prefix,
                ContinuationToken: token,
            };
            
            const results = await S3.listObjectsV2(listParams);
            const contents = results.Contents || [];
            token = results.ContinuationToken;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const keysToDelete: any[] = contents.map((content) => {
                return { Key: content.Key };
            });
            const params = {
                Bucket: FHIR_BINARY_BUCKET,
                Delete: {
                    Objects: keysToDelete,
                },
            };
            logger.info('Delete Params', params);
            promises.push(S3.deleteObjects(params));
        } while (token);

        try {
            await Promise.all(promises);
        } catch (e) {
            const message = 'Deletion has failed, please retry';
            logger.error(message, e);
            throw e;
        }
        return { message: '' };
    }
};

export default S3ObjectStorageService;
