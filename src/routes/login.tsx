import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "../lib/supabase";

const schema = z.object({
  email: z.string().min(1, "Obligatorio").email("Email inválido"),
  password: z.string().min(1, "Obligatorio"),
});

type FormData = z.infer<typeof schema>;

export default function Login() {
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  async function onSubmit(data: FormData) {
    setServerError(null);
    const { error } = await supabase.auth.signInWithPassword(data);
    if (error) {
      setServerError("Email o contraseña incorrectos");
      return;
    }
    navigate("/admin");
  }

  return (
    <div className="max-w-md mx-auto p-8">
      <h1 className="text-2xl font-bold mb-6">Entrar</h1>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label htmlFor="email" className="block mb-1">Email</label>
          <input id="email" type="email" {...register("email")} className="border w-full p-2 rounded" />
          {errors.email && <p className="text-red-600 text-sm">{errors.email.message}</p>}
        </div>
        <div>
          <label htmlFor="password" className="block mb-1">Contraseña</label>
          <input id="password" type="password" {...register("password")} className="border w-full p-2 rounded" />
          {errors.password && <p className="text-red-600 text-sm">{errors.password.message}</p>}
        </div>
        {serverError && <p className="text-red-600 text-sm">{serverError}</p>}
        <button
          type="submit"
          disabled={isSubmitting}
          className="bg-black text-white px-4 py-2 rounded disabled:opacity-50"
        >
          Entrar
        </button>
      </form>
      <p className="text-sm mt-4">
        ¿No tienes cuenta? <Link to="/signup" className="underline">Crear una</Link>
      </p>
    </div>
  );
}
