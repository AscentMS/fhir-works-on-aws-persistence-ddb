/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: Apache-2.0
 */
import { GetObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';

import { getBulkExportResults, startJobExecution } from './bulkExport';
import { BulkExportS3PresignedUrlGenerator } from './bulkExportS3PresignedUrlGenerator';
import { BulkExportJob } from './types';

describe('getBulkExportResults', () => {
    let bulkExportS3PresignedUrlGenerator: BulkExportS3PresignedUrlGenerator;
    const s3Mock = mockClient(S3Client);
    
    beforeEach(() => {
        process.env.GLUE_JOB_NAME = 'jobName';
        s3Mock.reset();

        /*
        AWSMock.mock('STS', 'assumeRole', (params: any, callback: Function) => {
            callback(null, {
                Credentials: { AccessKeyId: 'xxx', SecretAccessKey: 'xxx', SessionToken: 'xxx' },
            });
        });

        AWSMock.mock('S3', 'getSignedUrl', (apiCallToSign: any, params: any, callback: Function) => {
            callback(null, 'https://somePresignedUrl');
        });
        */

        bulkExportS3PresignedUrlGenerator = new BulkExportS3PresignedUrlGenerator();
    });

    test('happy case', async () => {
        /*
        AWSMock.mock('S3', 'listObjectsV2', (params: any, callback: Function) => {
            callback(null, {
                Contents: [{ Key: 'job-1/Patient-1.ndjson' }, { Key: 'job-1/Observation-1.ndjson' }],
            });
        });
        */
        jest.spyOn(bulkExportS3PresignedUrlGenerator, 'getUrls').mockResolvedValue(
            {
                requiresAccessToken: false,
                urls: [
                    'https://somePresignedUrl',
                    'https://somePresignedUrl' ,
                ]
            }
        );

        s3Mock
            .on(ListObjectsV2Command)
            .resolvesOnce({
                Contents: [{ Key: 'job-1/Patient-1.ndjson' }, { Key: 'job-1/Observation-1.ndjson' }]
            });
            
        await expect(getBulkExportResults(bulkExportS3PresignedUrlGenerator, 'job-1')).resolves.toEqual({
            requiresAccessToken: false,
            exportedFileUrls: [
                { type: 'Patient', url: 'https://somePresignedUrl' },
                { type: 'Observation', url: 'https://somePresignedUrl' },
            ],
        });

        expect(s3Mock).toHaveReceivedCommandTimes(ListObjectsV2Command, 1);
    });

    test('happy case with tenantId', async () => {
        /*
        AWSMock.mock('S3', 'listObjectsV2', (params: any, callback: Function) => {
            expect(params.Prefix).toEqual('tenant1/job-1');
            callback(null, {
                Contents: [{ Key: 'tenant1/job-1/Patient-1.ndjson' }, { Key: 'tenant1/job-1/Observation-1.ndjson' }],
            });
        });
        */
        jest.spyOn(bulkExportS3PresignedUrlGenerator, 'getUrls').mockResolvedValue(
            {
                requiresAccessToken: false,
                urls: [
                    'https://somePresignedUrl',
                    'https://somePresignedUrl' ,
                ]
            }
        );
    
        s3Mock
        .on(ListObjectsV2Command)
        .resolvesOnce({
            Contents: [{ Key: 'tenant1/job-1/Patient-1.ndjson' }, { Key: 'tenant1/job-1/Observation-1.ndjson' }],
        });

        await expect(getBulkExportResults(bulkExportS3PresignedUrlGenerator, 'job-1', 'tenant1')).resolves.toEqual({
            requiresAccessToken: false,
            exportedFileUrls: [
                { type: 'Patient', url: 'https://somePresignedUrl' },
                { type: 'Observation', url: 'https://somePresignedUrl' },
            ],
        });

        expect(s3Mock).toHaveReceivedCommandTimes(ListObjectsV2Command, 1);
    });

    test('no results', async () => {
        /*
        AWSMock.mock('S3', 'listObjectsV2', (params: any, callback: Function) => {
            callback(null, {
                Contents: [],
            });
        });
        */
        jest.spyOn(bulkExportS3PresignedUrlGenerator, 'getUrls').mockResolvedValue(
            {
                requiresAccessToken: false,
                urls: []
            }
        );

        s3Mock
        .on(ListObjectsV2Command)
        .resolvesOnce({
            Contents: [],
        });

        await expect(getBulkExportResults(bulkExportS3PresignedUrlGenerator, 'job-1')).resolves.toEqual({
            exportedFileUrls: [],
            requiresAccessToken: false,
        });

        expect(s3Mock).toHaveReceivedCommandTimes(ListObjectsV2Command, 1);
    });

    test('filenames with unknown format', async () => {
        /*
        AWSMock.mock('S3', 'listObjectsV2', (params: any, callback: Function) => {
            callback(null, {
                Contents: [{ Key: 'job-1/BadFilenameFormat$$.exe' }, { Key: 'job-1/Observation-1.ndjson' }],
            });
        });
        */
        jest.spyOn(bulkExportS3PresignedUrlGenerator, 'getUrls').mockImplementation(async (): Promise< { requiresAccessToken: boolean, urls: string[]}> => {
            throw new Error('Could not parse the name of bulk exports result file: job-1/BadFilenameFormat$$.exe');
        });

        s3Mock
        .on(ListObjectsV2Command)
        .resolvesOnce({
            Contents: [{ Key: 'job-1/BadFilenameFormat$$.exe' }, { Key: 'job-1/Observation-1.ndjson' }]
        });
    
        await expect(getBulkExportResults(bulkExportS3PresignedUrlGenerator, 'job-1')).rejects.toThrow(
            'Could not parse the name of bulk exports result file: job-1/BadFilenameFormat$$.exe',
        );

        expect(s3Mock).toHaveReceivedCommandTimes(ListObjectsV2Command, 1);
        expect(s3Mock).not.toHaveReceivedCommand(GetObjectCommand);
    });
});

describe('startJobExecution', () => {
    const sfnMock = mockClient(SFNClient);

    beforeEach(() => {
        sfnMock.reset();
    });

    const jobId = 'job-1';
    const jobOwnerId = 'owner-1';
    const exportType = 'system';
    const transactionTime = '2020-10-10T00:00:00.000Z';
    const since = '2020-10-09T00:00:00.000Z';
    const outputFormat = 'ndjson';

    test('starts step functions execution', async () => {
        /*
        const mockStartExecution = jest.fn((params: any, callback: Function) => {
            callback(null);
        });       
        AWSMock.mock('StepFunctions', 'startExecution', mockStartExecution);
        */

        sfnMock
            .on(StartExecutionCommand)
            .resolvesOnce({
                $metadata: {
                    httpStatusCode: 200,
                }
            });

        const job: BulkExportJob = {
            jobId,
            jobStatus: 'in-progress',
            jobOwnerId,
            exportType,
            transactionTime,
            outputFormat,
            since,
        };

        const expectedInput = {
            jobId,
            jobOwnerId,
            exportType,
            transactionTime,
            since,
            outputFormat,
        };

        await startJobExecution(job);
        expect(sfnMock.call(0).args[0].input).toEqual(
            {
                input: JSON.stringify(expectedInput),
                name: 'job-1',
                stateMachineArn: '',
            }
        );
        expect(sfnMock).toHaveReceivedCommandTimes(StartExecutionCommand, 1);
    });

    test('starts step functions execution in multi-tenancy mode', async () => {
        /*
        const mockStartExecution = jest.fn((params: any, callback: Function) => {
            callback(null);
        });
        AWSMock.mock('StepFunctions', 'startExecution', mockStartExecution);
        */

        sfnMock
            .on(StartExecutionCommand)
            .resolvesOnce({
                $metadata: {
                    httpStatusCode: 200,
                }
            });
            
        const tenantId = 'tenantId';
        const job: BulkExportJob = {
            jobId,
            jobStatus: 'in-progress',
            jobOwnerId,
            exportType,
            transactionTime,
            outputFormat,
            since,
            tenantId,
        };

        const expectedInput = {
            jobId,
            jobOwnerId,
            exportType,
            transactionTime,
            since,
            outputFormat,
            tenantId,
        };

        await startJobExecution(job);
        expect(sfnMock.call(0).args[0].input).toEqual(
            {
                input: JSON.stringify(expectedInput),
                name: 'job-1',
                stateMachineArn: '',
            }
        );
        expect(sfnMock).toHaveReceivedCommandTimes(StartExecutionCommand, 1);
    });
});
