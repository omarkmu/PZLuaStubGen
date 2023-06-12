import { AssertionError } from 'assert';

export const assertNull = (value: any, name: string): void => {
    if (value != null) {
        throw new AssertionError({ message: `The value '${name}' is NOT null.` });
    }
};

export const assertNonNull = (value: any, name: string): void => {
    if (value == null) {
        throw new AssertionError({ message: `The value '${name}' is null.` });
    }
};

export const assertString = (value: string, name: string): void => {
    assertNonNull(value, name);
    if (typeof value !== 'string') {
        throw new AssertionError({ message: `The value '${name}' is not a string. (type: ${typeof value})` });
    }
};

export const assertEmptyString = (value: string, name: string): void => {
    assertString(value, name);
    if (value.length !== 0) {
        throw new AssertionError({ message: `The string '${name}' is NOT empty.` });
    }
};

export const assertNonEmptyString = (value: string, name: string): void => {
    assertString(value, name);
    if (value.length === 0) {
        throw new AssertionError({ message: `The string '${name}' is empty.` });
    }
};
