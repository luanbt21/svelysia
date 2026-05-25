<script lang="ts">
	import { page } from "$app/state";
	import { authClient } from "$lib/auth-client";
	import { GitHub, Google, Svelte as Logo } from "$lib/components/svgs/index";
	import { Button } from "$lib/components/ui/button";
	import { Card } from "$lib/components/ui/card";
	import { Input } from "$lib/components/ui/input";
	import { Label } from "$lib/components/ui/label";
	import { Spinner } from "$lib/components/ui/spinner";
	import type { Component } from "svelte";
	import { toast } from "svelte-sonner";
	import type { EventHandler } from "svelte/elements";

	const callbackURL = page.url.searchParams.get("redirect") || "/trees";
	let pending = $state(false);

	const handleSubmit: EventHandler<SubmitEvent, HTMLFormElement> = async (
		e,
	) => {
		e.preventDefault();
		pending = true;
		try {
			const data = new FormData(e.currentTarget);
			const email = data.get("email");
			const password = data.get("password");
			if (!email || !password) {
				toast.error("All fields are required");
				return;
			}

			const { error } = await authClient.signIn.email({
				email: email as string,
				password: password as string,
				callbackURL,
			});

			if (error) {
				toast.error(error.message || "Failed to sign in");
				return;
			}

			toast.success("Signed in successfully!");
		} catch (err) {
			toast.error("Failed to sign in");
			console.error(err);
		} finally {
			pending = false;
		}
	};

	const socialProviders: {
		name: string;
		icon: Component;
		handle: () => Promise<unknown>;
	}[] = [
		{
			name: "Google",
			icon: Google,
			handle: () =>
				authClient.signIn.social({ provider: "google", callbackURL }),
		},
		{
			name: "GitHub",
			icon: GitHub,
			handle: () =>
				authClient.signIn.social({ provider: "github", callbackURL }),
		},
	];
</script>

<section class="grid min-h-screen grid-rows-[auto_1fr] bg-background px-4">
	<div class="mx-auto w-full max-w-7xl border-b py-3">
		<Button
			href="/"
			aria-label="go home"
			variant="ghost"
			size="sm"
			class="inline-block h-auto border-t-2 border-transparent py-3 hover:bg-transparent"
		>
			<Logo class="w-fit" />
		</Button>
	</div>

	<div class="m-auto w-full max-w-sm">
		<div class="text-center">
			<h1 class="font-serif text-4xl font-medium">Welcome back</h1>
			<p class="mt-2 text-sm text-muted-foreground">
				Sign in to your account to continue
			</p>
		</div>
		<Card class="mt-6 p-8">
			<form action="" class="space-y-5" onsubmit={handleSubmit}>
				<div class="space-y-3">
					<Label for="email" class="text-sm">Email</Label>
					<Input
						type="email"
						id="email"
						name="email"
						placeholder="you@example.com"
						required
						disabled={pending}
					/>
				</div>

				<div class="space-y-3">
					<div class="flex items-center justify-between">
						<Label for="password" class="text-sm">Password</Label>
						<Button
							href="/forgot-password"
							variant="link"
							class="h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
						>
							Forgot password?
						</Button>
					</div>
					<Input
						type="password"
						id="password"
						name="password"
						placeholder="Enter your password"
						required
						disabled={pending}
					/>
				</div>

				<Button class="w-full" type="submit" disabled={pending}>
					{#if pending}
						<Spinner />
					{/if}
					Sign In
				</Button>
			</form>

			<div class="my-6 flex items-center gap-3">
				<hr class="flex-1" />
				<span class="text-xs text-muted-foreground">or continue with</span>
				<hr class="flex-1" />
			</div>

			<div class="grid grid-cols-2 gap-3">
				{#each socialProviders as provider}
					<Button type="button" variant="outline" onclick={provider.handle} disabled={pending}>
						<provider.icon class="size-4" />
						<span>{provider.name}</span>
					</Button>
				{/each}
			</div>
		</Card>

		<p class="mt-6 text-center text-sm text-muted-foreground">
			Don't have an account?
			<Button href="/register" variant="link" class="px-1 font-medium text-primary"
				>Sign up</Button
			>
		</p>
	</div>
</section>
