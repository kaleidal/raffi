/**
 * Our components are runes-only; dependencies compile in whichever mode they were written for.
 * @param {{ filename: string }} file
 */
export const runesOutsideDependencies = ({ filename }) => (filename.includes("/node_modules/") ? undefined : { runes: true });

export default {
    compilerOptions: { runes: true },
};
