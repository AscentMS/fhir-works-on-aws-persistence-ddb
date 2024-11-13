import { makeLogger } from '@ascentms/fhir-works-on-aws-interface';

const componentLogger = makeLogger({
    component: 'persistence',
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function getComponentLogger(): any {
    return componentLogger;
}
