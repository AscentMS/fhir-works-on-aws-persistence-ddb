/* eslint-disable @typescript-eslint/no-explicit-any */
/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: Apache-2.0
 */
import { BatchStopJobRunCommand, Glue } from '@aws-sdk/client-glue';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';

import { BulkExportStateMachineGlobalParameters } from './types';
import { stopExportJobHandler } from './stopExportJob';


const jobOwnerId = 'owner-1';

describe('getJobStatus', () => {
    const glueJobName = 'jobName';
    const glueJobRunId = 'jr_1';
    const glueMock = mockClient(Glue);

    beforeEach(() => {
        process.env.GLUE_JOB_NAME = 'jobName';
        glueMock.reset();
    });

    afterAll(() => {
        glueMock.restore();
    });

    test('stop job successfully', async () => {
        const event: BulkExportStateMachineGlobalParameters = {
            jobId: '1',
            jobOwnerId,
            exportType: 'system',
            transactionTime: '',
            executionParameters: {
                glueJobRunId,
            },
        };

        /*
        AWSMock.mock('Glue', 'batchStopJobRun', (params: any, callback: Function) => {
            callback(null, {
                SuccessfulSubmissions: [
                    {
                        JobName: glueJobName,
                        JobRunId: glueJobRunId,
                    },
                ],
                Errors: [],
            });
        });
        */

        glueMock.on(BatchStopJobRunCommand).resolvesOnce(
            {
                SuccessfulSubmissions: [
                    {
                        JobName: glueJobName,
                        JobRunId: glueJobRunId,
                    },
                ],
                Errors: [],
            }
        );

        await expect(stopExportJobHandler(event, null as any, null as any)).resolves.toEqual(event);
    });

    test('stop job failed', async () => {
        const event: BulkExportStateMachineGlobalParameters = {
            jobId: '1',
            jobOwnerId,
            exportType: 'system',
            transactionTime: '',
            executionParameters: {
                glueJobRunId,
            },
        };

        /*
        AWSMock.mock('Glue', 'batchStopJobRun', (params: any, callback: Function) => {
            callback(null, {
                SuccessfulSubmissions: [],
                Errors: [
                    {
                        JobName: glueJobName,
                        JobRunId: glueJobRunId,
                        ErrorDetail: {
                            ErrorCode: 'JobRunCannotBeStoppedException',
                            ErrorMessage: 'Job Run cannot be stopped in current state.',
                        },
                    },
                ],
            });
        });
        */

        glueMock.on(BatchStopJobRunCommand).resolvesOnce(
            {
                SuccessfulSubmissions: [],
                Errors: [
                    {
                        JobName: glueJobName,
                        JobRunId: glueJobRunId,
                        ErrorDetail: {
                            ErrorCode: 'JobRunCannotBeStoppedException',
                            ErrorMessage: 'Job Run cannot be stopped in current state.',
                        },
                    },
                ],
            }
        );

        await expect(stopExportJobHandler(event, null as any, null as any)).rejects.toThrow(
            `Failed to stop job ${glueJobRunId}`,
        );
    });

    test('missing env variable GLUE_JOB_NAME ', async () => {
        delete process.env.GLUE_JOB_NAME;
        const event: BulkExportStateMachineGlobalParameters = {
            jobId: '1',
            jobOwnerId,
            exportType: 'system',
            transactionTime: '',
            executionParameters: {
                glueJobRunId,
            },
        };
        await expect(stopExportJobHandler(event, null as any, null as any)).rejects.toThrow(
            'GLUE_JOB_NAME environment variable is not defined',
        );
    });

    test('missing glueJobRunId ', async () => {
        const event: BulkExportStateMachineGlobalParameters = {
            jobId: '1',
            jobOwnerId,
            exportType: 'system',
            transactionTime: '',
            executionParameters: {},
        };
        await expect(stopExportJobHandler(event, null as any, null as any)).rejects.toThrow(
            'executionParameters.glueJobRunId is missing in input event',
        );
    });
});
