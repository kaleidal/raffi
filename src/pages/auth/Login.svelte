<script lang="ts">
    import { onMount } from "svelte";
    import { supabase } from "../../lib/db/supabase";

    let email = "";
    let password = "";

    const login = async () => {
        if (!email || !password) {
            alert("please fill in all fields");
            return;
        }

        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) {
            console.error(error);
            alert(error.message);
            return;
        }
    };

    const register = async () => {
        if (!email || !password) {
            alert("please fill in all fields");
            return;
        }

        const { data, error } = await supabase.auth.signUp({
            email,
            password,
        });

        if (error) {
            console.error(error);
            alert(error.message);
            return;
        }

        alert("check your email for the confirmation link!");
    };

    onMount(async () => {
        const { data, error } = await supabase.auth.getSession();
        if (data.session) {
            window.location.href = "/#/meta";
        }
    });
</script>

<div
    class="bg-[#090909] h-screen w-screen flex items-center justify-center gap-[20px] p-[20px]"
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
                <svg
                    width="49"
                    height="49"
                    viewBox="0 0 49 49"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <path
                        d="M10.208 24.5H38.7913M38.7913 24.5L24.4997 10.2083M38.7913 24.5L24.4997 38.7916"
                        stroke="black"
                        stroke-width="4"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    />
                </svg>
            </button>
        </div>
    </div>
</div>
