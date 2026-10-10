import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";

export type AuthResult = { ok: true; needsEmailConfirmation?: boolean } | { ok: false; message: string };

export const useAuth = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  useEffect(() => {
    if (!supabase) return;

    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
      if (event === "PASSWORD_RECOVERY") setPasswordRecovery(true);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const user: User | null = session?.user ?? null;
  return { session, user, loading, passwordRecovery, clearPasswordRecovery: () => setPasswordRecovery(false) };
};

export const requestPasswordReset = async (email: string): Promise<AuthResult> => {
  if (!supabase) return { ok: false, message: "Accounts are not set up for this site yet." };

  try {
    const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) return { ok: false, message: error.message };
    return { ok: true };
  } catch (error) {
    return { ok: false, message: messageFrom(error) };
  }
};

export const updatePassword = async (password: string): Promise<AuthResult> => {
  if (!supabase) return { ok: false, message: "Accounts are not set up for this site yet." };

  try {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return { ok: false, message: error.message };
    return { ok: true };
  } catch (error) {
    return { ok: false, message: messageFrom(error) };
  }
};

const messageFrom = (error: unknown) =>
  error instanceof Error && error.message ? error.message : "Something went wrong. Please try again.";

export const signUpWithEmail = async (email: string, password: string): Promise<AuthResult> => {
  if (!supabase) return { ok: false, message: "Accounts are not set up for this site yet." };

  try {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { ok: false, message: error.message };

    // With "Confirm email" turned on in Supabase, no session comes back until the
    // person clicks the link in their inbox.
    return { ok: true, needsEmailConfirmation: !data.session };
  } catch (error) {
    return { ok: false, message: messageFrom(error) };
  }
};

export const signInWithEmail = async (email: string, password: string): Promise<AuthResult> => {
  if (!supabase) return { ok: false, message: "Accounts are not set up for this site yet." };

  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, message: error.message };
    return { ok: true };
  } catch (error) {
    return { ok: false, message: messageFrom(error) };
  }
};

export const signOut = async () => {
  if (!supabase) return;
  try {
    await supabase.auth.signOut();
  } catch {
    // Fall back to clearing just this device's session if the server call fails.
    await supabase.auth.signOut({ scope: "local" });
  }
};
