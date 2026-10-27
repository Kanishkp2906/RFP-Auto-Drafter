import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { api } from "../lib/api";
import type { UserProfile } from "../lib/types";

interface AuthContextValue {
  session: Session | null;
  profile: UserProfile | null;
  initializing: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    username: string,
    password: string
  ) => Promise<{ confirmationRequired: boolean }>;
  signInWithGoogle: () => Promise<void>;
  updateUsername: (newUsername: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [initializing, setInitializing] = useState(true);
  const profileRequestId = useRef(0);

  const loadProfile = useCallback(async (userId: string) => {
    const requestId = ++profileRequestId.current;
    try {
      const data = await api.getProfile();
      if (profileRequestId.current === requestId) setProfile(data);
    } catch {
      if (profileRequestId.current === requestId) setProfile(null);
    }
    void userId;
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        setSession(data.session);
        setInitializing(false);
      })
      .catch(() => {
        if (mounted) setInitializing(false);
      });

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        setSession(newSession);
        if (event === "SIGNED_OUT" || !newSession) {
          setProfile(null);
        }
      }
    );

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (session?.user?.id) {
      loadProfile(session.user.id);
    } else {
      setProfile(null);
    }
  }, [session?.user?.id, loadProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw new Error(error.message);
  }, []);

  const signUp = useCallback(
    async (email: string, username: string, password: string) => {
      try {
        const response = await fetch(
          `${import.meta.env.VITE_API_BASE_URL || "http://localhost:8000"}/v1/users/signup`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, username, password }),
          }
        );
        if (!response.ok) {
          let detail = "Signup failed. Please try again.";
          try {
            const data = await response.json();
            if (typeof data?.detail === "string") detail = data.detail;
          } catch {
            // keep default message
          }
          throw new Error(detail);
        }
      } catch (error) {
        if (error instanceof Error && error.message) throw error;
        throw new Error("Signup failed. Please try again.");
      }

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        const message = error.message.toLowerCase();
        if (
          message.includes("confirm") ||
          message.includes("not confirmed") ||
          message.includes("invalid login")
        ) {
          return { confirmationRequired: true };
        }
        throw new Error(error.message);
      }

      return { confirmationRequired: false };
    },
    []
  );

  const signInWithGoogle = useCallback(async () => {
    // Redirects the whole browser to Google; the session arrives back at
    // /auth/callback where supabase-js exchanges the PKCE code automatically
    // (detectSessionInUrl is enabled on the shared client).
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      throw new Error(error.message || "Could not start Google sign-in.");
    }
  }, []);

  const updateUsername = useCallback(async (newUsername: string) => {
    const updated = await api.updateUsername(newUsername);
    setProfile({ ...updated });
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback`,
    });
    if (error) throw new Error(error.message);
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        session,
        profile,
        initializing,
        signIn,
        signUp,
        signInWithGoogle,
        updateUsername,
        resetPassword,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
