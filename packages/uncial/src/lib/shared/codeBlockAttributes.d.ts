export declare const CODE_BLOCK_ID = "codeBlock";
export declare const CODE_BLOCK_LANGUAGE_OPTIONS: {
    value: string;
    label: string;
}[];
export declare const codeBlockAttributes: {
    language: {
        default: string;
        input: "select";
        options: {
            value: string;
            label: string;
        }[];
        parse: (value: unknown) => string;
    };
};
export declare const codeBlockAttributeTarget: {
    id: string;
    label: string;
    attributes: {
        language: {
            default: string;
            input: "select";
            options: {
                value: string;
                label: string;
            }[];
            parse: (value: unknown) => string;
        };
    };
};
