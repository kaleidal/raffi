/** Our components are runes-only; dependencies compile in whichever mode they were written for. */
export const runesOutsideDependencies = ({ filename }: { filename: string }) =>
    filename.includes("/node_modules/") ? undefined : { runes: true };
