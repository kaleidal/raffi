import type { AuthConfig } from "convex/server";

const aveClientId = "app_13afc5b8884e9985d89eac0f4ca4b5af";

export default {
    providers: [
        {
            domain: "https://aveid.net",
            applicationID: aveClientId,
        },
    ],
} satisfies AuthConfig;
