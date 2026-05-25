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
	import { goto } from "$app/navigation";
	import { m } from "$lib/paraglide/messages.js";
	import LanguageSwitcher from "$lib/components/language-switcher.svelte";

	const callbackURL = page.url.searchParams.get("redirect") || "/trees";
	let pending = $state(false);

	const handleSubmit: EventHandler<SubmitEvent, HTMLFormElement> = async (
		e,
	) => {
		e.preventDefault();
		pending = true;
		try {
			const data = new FormData(e.currentTarget);
			const email = data.get("email") as string;
			const password = data.get("password") as string;
			const name = data.get("name") as string;
			const username = data.get("username") as string;

			if (!email || !password || !name || !username) {
				toast.error(m.fields_required_error());
				return;
			}

			const { error } = await authClient.signUp.email({
				email,
				password,
				name,
				username,
				callbackURL,
			});

			if (error) {
				toast.error(error.message || m.sign_up_failed());
				return;
			}

			toast.success(m.sign_up_success());
			goto("/login");
		} catch (err) {
			toast.error(m.sign_up_failed());
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
	<div class="mx-auto w-full max-w-7xl border-b py-3 flex items-center justify-between">
		<Button
			href="/"
			aria-label="go home"
			variant="ghost"
			size="sm"
			class="inline-block h-auto border-t-2 border-transparent py-3 hover:bg-transparent"
		>
			<Logo class="w-fit" />
		</Button>
		<LanguageSwitcher />
	</div>

	<div class="m-auto w-full max-w-sm">
		<div class="text-center">
			<h1 class="font-serif text-4xl font-medium">{m.create_account_title()}</h1>
			<p class="mt-2 text-sm text-muted-foreground">
				{m.get_started_today()}
			</p>
		</div>
		<Card class="mt-6 p-8">
			<form action="" class="space-y-5" onsubmit={handleSubmit}>
				<div class="space-y-3">
					<Label for="name" class="text-sm">{m.full_name()}</Label>
					<Input
						type="text"
						id="name"
						name="name"
						placeholder="John Doe"
						required
						disabled={pending}
					/>
				</div>

				<div class="space-y-3">
					<Label for="username" class="text-sm">{m.username()}</Label>
					<Input
						type="text"
						id="username"
						name="username"
						placeholder="johndoe"
						required
						disabled={pending}
					/>
				</div>

				<div class="space-y-3">
					<Label for="email" class="text-sm">{m.email()}</Label>
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
					<Label for="password" class="text-sm">{m.password()}</Label>
					<Input
						type="password"
						id="password"
						name="password"
						placeholder={m.create_password_placeholder()}
						required
						disabled={pending}
					/>
				</div>

				<Button class="w-full" type="submit" disabled={pending}>
					{#if pending}
						<Spinner />
					{/if}
					{m.create_account_btn()}
				</Button>
			</form>

			<div class="my-6 flex items-center gap-3">
				<hr class="flex-1" />
				<span class="text-xs text-muted-foreground">{m.or_continue_with()}</span>
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
			{m.already_have_account()}
			<Button href="/login" variant="link" class="px-1 font-medium text-primary"
				>{m.sign_in()}</Button
			>
		</p>
	</div>
</section>

