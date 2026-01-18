<script lang="ts">
    import { ArrowRight } from "lucide-svelte";
    import { onMount } from "svelte";
    import { supabase } from "../../lib/db/supabase";
    import { enableLocalMode } from "../../lib/stores/authStore";
    import { router } from "../../lib/stores/router";
    import { trackEvent } from "../../lib/analytics";

    let email = "";
    let password = "";
    let statusMessage = "";
    let statusType: "error" | "success" | "" = "";

    const setStatus = (type: "error" | "success" | "", message = "") => {
        statusType = type;
        statusMessage = message;
    };

    const login = async () => {
        if (!email || !password) {
            setStatus("error", "please fill in all fields");
            return;
        }
        setStatus("", "");

        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) {
            console.error(error);
            setStatus("error", error.message);
            return;
        }

        setStatus("success", "signed in!");
    };

    const register = async () => {
        if (!email || !password) {
            setStatus("error", "please fill in all fields");
            return;
        }
        setStatus("", "");

        const { data, error } = await supabase.auth.signUp({
            email,
            password,
        });

        if (error) {
            console.error(error);
            setStatus("error", error.message);
            return;
        }

        setStatus("success", "check your email for the confirmation link!");
    };

    onMount(async () => {
        const { data, error } = await supabase.auth.getSession();
        if (data.session) {
            router.navigate("home");
        }
    });

    function continueLocal() {
        enableLocalMode();
        trackEvent("local_mode_enabled");
        router.navigate("home");
    }
</script>

<div
    class="bg-[#090909] h-full w-full flex items-center justify-center gap-[20px] p-[20px]"
>
    <div
        class="bg-[#353535] flex-grow h-full rounded-[48px] p-[20px] px-[80px]"
    >
        <span class="text-white font-syne font-black text-[128px]">raffi</span>
    </div>

    <div
        class="bg-[#D3D3D3] w-[35vw] h-full rounded-[48px] flex flex-col gap-[20px] items-center justify-center"
    >
        <input
            class="border-b-[3px] border-black w-[80%] p-[20px] text-[32px] text-black font-poppins font-[500] focus:ring-0 focus:outline-none placeholder:text-black"
            type="text"
            placeholder="email"
            bind:value={email}
        />

        <input
            class="border-b-[3px] border-black w-[80%] p-[20px] text-[32px] text-black font-poppins font-[500] focus:ring-0 focus:outline-none placeholder:text-black"
            type="password"
            placeholder="password"
            bind:value={password}
        />

        {#if statusMessage}
            <div class={`w-[80%] text-center text-[18px] font-poppins ${statusType === "error" ? "text-[#B00020]" : "text-[#1B5E20]"}`}>
                {statusMessage}
            </div>
        {/if}

        <div class="flex flex-row gap-0 w-[80%] items-center justify-end">
            <button
                class="bg-white p-[20px] rounded-full hover:rounded-[0px] cursor-pointer text-black font-poppins font-[500] text-[32px]"
                aria-label="register"
                on:click={register}
            >
                register
            </button>

            <button
                class="bg-white p-[20px] rounded-full hover:rounded-[0px] cursor-pointer"
                aria-label="login"
                on:click={login}
            >
                <ArrowRight size={49} strokeWidth={2.5} color="black" />
            </button>
        </div>

        <button
            class="text-black/70 text-[18px] font-poppins font-semibold underline underline-offset-4 hover:text-black mt-[40px]"
            on:click={continueLocal}
        >
            continue locally
        </button>
    </div>
</div>
