/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: Apache-2.0
 *
 */

import { STS } from '@aws-sdk/client-sts';
import { BulkExportResultsUrlGenerator } from './bulkExportResultsUrlGenerator';
import { GetObjectCommand, S3 } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';


const EXPIRATION_TIME_SECONDS = 1800;
const EXPORT_CONTENT_TYPE = 'application/fhir+ndjson';
const EXPORT_RESULTS_SIGNER_ROLE_ARN = process.env.EXPORT_RESULTS_SIGNER_ROLE_ARN || '';

export class BulkExportS3PresignedUrlGenerator implements BulkExportResultsUrlGenerator {
    private readonly stsClient: STS;

    constructor() {
        this.stsClient = new STS();
    }

    async getUrls({ s3Keys, exportBucket }: { exportBucket: string; s3Keys: string[] }) {
        const assumeRoleResponse = await this.stsClient
            .assumeRole({
                RoleArn: EXPORT_RESULTS_SIGNER_ROLE_ARN,
                RoleSessionName: 'signBulkExportResults',
                DurationSeconds: EXPIRATION_TIME_SECONDS,
            });

        const s3 = new S3({
            credentials: {
                accessKeyId: assumeRoleResponse.Credentials!.AccessKeyId!,
                secretAccessKey: assumeRoleResponse.Credentials!.SecretAccessKey!,
                sessionToken: assumeRoleResponse.Credentials!.SessionToken,
            },
        });

        const urls: string[] = await Promise.all(
            s3Keys.map(async (key) =>
                getSignedUrl(
                    s3,
                    new GetObjectCommand({
                        Bucket: exportBucket,
                        Key: key,
                        ResponseContentType: EXPORT_CONTENT_TYPE
                    }),
                    {
                        expiresIn: EXPIRATION_TIME_SECONDS
                    }
                ),
            ),
        );

        return {
            requiresAccessToken: false,
            urls,
        };
    }
}
