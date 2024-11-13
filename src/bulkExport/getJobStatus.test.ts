/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: Apache-2.0
 */

import { DynamoDB, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { GetJobRunCommand, Glue } from '@aws-sdk/client-glue';
import { marshall } from '@aws-sdk/util-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';

import DynamoDbParamBuilder from '../dataServices/dynamoDbParamBuilder';
import { getJobStatusHandler } from './getJobStatus';
import { BulkExportStateMachineGlobalParameters } from './types';

const jobOwnerId = 'owner-1';

describe('getJobStatus', () => {
    const dynamoDbMock = mockClient(DynamoDB);
    const glueMock = mockClient(Glue);

    beforeEach(() => {
        process.env.GLUE_JOB_NAME = 'jobName';
        dynamoDbMock.reset();
        glueMock.reset();
    });

    afterAll(() => {
        dynamoDbMock.restore();
        glueMock.restore();
    });

    test('completed job', async () => {
        const event: BulkExportStateMachineGlobalParameters = {
            jobId: '1',
            jobOwnerId,
            exportType: 'system',
            transactionTime: '',
            executionParameters: {
                glueJobRunId: 'jr_1',
            },
        };
        process.env.GLUE_JOB_NAME = 'jobName';
        /*
        AWSMock.mock('Glue', 'getJobRun', (params: any, callback: Function) => {
            callback(null, {
                JobRun: {
                    JobRunState: 'SUCCEEDED',
                },
            });
        });

        AWSMock.mock('DynamoDB', 'getItem', (params: QueryInput, callback: Function) => {
            callback(null, {
                Item: marshall({
                    jobId: '2a937fe2-8bb1-442b-b9be-434c94f30e15',
                    jobStatus: 'in-progress',
                }),
            });
        });
        */
        glueMock.on(GetJobRunCommand).resolvesOnce({
            JobRun: {
                JobRunState: 'SUCCEEDED',
            },
        });

        dynamoDbMock.on(GetItemCommand).resolvesOnce({
            Item: marshall({
                jobId: '2a937fe2-8bb1-442b-b9be-434c94f30e15',
                jobStatus: 'in-progress',
            }),
        });

        await expect(getJobStatusHandler(event, null as any, null as any)).resolves.toEqual({
            jobId: '1',
            jobOwnerId,
            exportType: 'system',
            transactionTime: '',
            executionParameters: {
                glueJobRunId: 'jr_1',
                glueJobRunStatus: 'SUCCEEDED',
                isCanceled: false,
            },
        });
    });

    test('completed job in multi-tenancy mode', async () => {
        const event: BulkExportStateMachineGlobalParameters = {
            jobId: '1',
            jobOwnerId,
            tenantId: 'tenant1',
            exportType: 'system',
            transactionTime: '',
            executionParameters: {
                glueJobRunId: 'jr_1',
            },
        };
        process.env.GLUE_JOB_NAME = 'jobName';

        /*
        AWSMock.mock('Glue', 'getJobRun', (params: any, callback: Function) => {
            callback(null, {
                JobRun: {
                    JobRunState: 'SUCCEEDED',
                },
            });
        });
        const getItemSpy = sinon.spy();
        AWSMock.mock('DynamoDB', 'getItem', (params: QueryInput, callback: Function) => {
            getItemSpy(params);
            callback(null, {
                Item: marshall({
                    jobId: 'tenan1|2a937fe2-8bb1-442b-b9be-434c94f30e15',
                    jobStatus: 'in-progress',
                }),
            });
        });
        */

        glueMock.on(GetJobRunCommand).resolvesOnce({
            JobRun: {
                JobRunState: 'SUCCEEDED',
            },
        });

        dynamoDbMock.on(GetItemCommand).resolvesOnce({
            Item: marshall({
                jobId: 'tenan1|2a937fe2-8bb1-442b-b9be-434c94f30e15',
                jobStatus: 'in-progress',
            }),
        });

        await expect(getJobStatusHandler(event, null as any, null as any)).resolves.toEqual({
            jobId: '1',
            jobOwnerId,
            tenantId: 'tenant1',
            exportType: 'system',
            transactionTime: '',
            executionParameters: {
                glueJobRunId: 'jr_1',
                glueJobRunStatus: 'SUCCEEDED',
                isCanceled: false,
            },
        });
        //expect(getItemSpy.getCall(0).args[0]).toMatchObject(DynamoDbParamBuilder.buildGetExportRequestJob('tenant1|1'));
        expect(dynamoDbMock.call(0).args[0].input).toMatchObject(DynamoDbParamBuilder.buildGetExportRequestJob('tenant1|1'))
    });

    test('failed job', async () => {
        const event: BulkExportStateMachineGlobalParameters = {
            jobId: '1',
            jobOwnerId,
            exportType: 'system',
            transactionTime: '',
            executionParameters: {
                glueJobRunId: 'jr_1',
            },
        };

        /*
        AWSMock.mock('Glue', 'getJobRun', (params: any, callback: Function) => {
            callback(null, {
                JobRun: {
                    JobRunState: 'FAILED',
                },
            });
        });
        AWSMock.mock('DynamoDB', 'getItem', (params: QueryInput, callback: Function) => {
            callback(null, {
                Item: marshall({
                    jobId: '2a937fe2-8bb1-442b-b9be-434c94f30e15',
                    jobStatus: 'in-progress',
                }),
            });
        });
        */

        glueMock.on(GetJobRunCommand).resolvesOnce({
            JobRun: {
                JobRunState: 'FAILED',
            },
        });

        dynamoDbMock.on(GetItemCommand).resolvesOnce({
            Item: marshall({
                jobId: '2a937fe2-8bb1-442b-b9be-434c94f30e15',
                jobStatus: 'in-progress',
            }),
        });

        await expect(getJobStatusHandler(event, null as any, null as any)).resolves.toEqual({
            jobId: '1',
            jobOwnerId,
            exportType: 'system',
            transactionTime: '',
            executionParameters: {
                glueJobRunId: 'jr_1',
                glueJobRunStatus: 'FAILED',
                isCanceled: false,
            },
        });
    });

    test('canceled job', async () => {
        const event: BulkExportStateMachineGlobalParameters = {
            jobId: '1',
            jobOwnerId,
            exportType: 'system',
            transactionTime: '',
            executionParameters: {
                glueJobRunId: 'jr_1',
            },
        };

        /*
        AWSMock.mock('Glue', 'getJobRun', (params: any, callback: Function) => {
            callback(null, {
                JobRun: {
                    JobRunState: 'RUNNING',
                },
            });
        });
        AWSMock.mock('DynamoDB', 'getItem', (params: QueryInput, callback: Function) => {
            callback(null, {
                Item: marshall({
                    jobId: '2a937fe2-8bb1-442b-b9be-434c94f30e15',
                    jobStatus: 'canceling',
                }),
            });
        });
        */

        glueMock.on(GetJobRunCommand).resolvesOnce({
            JobRun: {
                JobRunState: 'RUNNING',
            },
        });

        dynamoDbMock.on(GetItemCommand).resolvesOnce({
            Item: marshall({
                jobId: '2a937fe2-8bb1-442b-b9be-434c94f30e15',
                    jobStatus: 'canceling',
            }),
        });


        await expect(getJobStatusHandler(event, null as any, null as any)).resolves.toEqual({
            jobId: '1',
            jobOwnerId,
            exportType: 'system',
            transactionTime: '',
            executionParameters: {
                glueJobRunId: 'jr_1',
                glueJobRunStatus: 'RUNNING',
                isCanceled: true,
            },
        });
    });

    test('missing env variables ', async () => {
        delete process.env.GLUE_JOB_NAME;
        const event: BulkExportStateMachineGlobalParameters = {
            jobId: '1',
            jobOwnerId,
            exportType: 'system',
            transactionTime: '',
            executionParameters: {
                glueJobRunId: 'jr_1',
            },
        };
        await expect(getJobStatusHandler(event, null as any, null as any)).rejects.toThrow(
            'GLUE_JOB_NAME environment variable is not defined',
        );
    });

    test('missing glueJobRunId ', async () => {
        const event: BulkExportStateMachineGlobalParameters = {
            jobId: '1',
            jobOwnerId,
            exportType: 'system',
            transactionTime: '',
        };
        await expect(getJobStatusHandler(event, null as any, null as any)).rejects.toThrow(
            'executionParameters.glueJobRunId is missing in input event',
        );
    });
});
