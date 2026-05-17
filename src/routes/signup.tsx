import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

const schema = z.object({
  companyName: z.string().min(1, "Obligatorio"),
  fullName: z.string().min(1, "Obligatorio"),
  email: z.string().min(1, "Obligatorio").email("Email inválido"),
  password: z.string().min(8, "Mínimo 8 caracteres"),
});

type FormData = z.infer<typeof schema>;

function slugify(name: string) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function Signup() {
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  async function onSubmit(data: FormData) {
    setServerError(null);
    const { data: signupData, error: signupError } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
    });
    if (signupError || !signupData.user) {
      setServerError(signupError?.message ?? "Error desconocido");
      return;
    }
    const { error: rpcError } = await supabase.rpc("signup_create_company", {
      p_company_name: data.companyName,
      p_company_slug: slugify(data.companyName) + "-" + Date.now().toString(36),
      p_full_name: data.fullName,
    });
    if (rpcError) {
      setServerError(rpcError.message);
      return;
    }
    navigate("/admin");
  }

  return (
    <div className="max-w-md mx-auto p-8">
      <h1 className="text-2xl font-bold mb-6">Crear cuenta de admin</h1>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label htmlFor="companyName" className="block mb-1">Nombre de tu empresa</label>
          <input id="companyName" {...register("companyName")} className="border w-full p-2 rounded" />
          {errors.companyName && <p className="text-red-600 text-sm">{errors.companyName.message}</p>}
        </div>
        <div>
          <label htmlFor="fullName" className="block mb-1">Tu nombre</label>
          <input id="fullName" {...register("fullName")} className="border w-full p-2 rounded" />
          {errors.fullName && <p className="text-red-600 text-sm">{errors.fullName.message}</p>}
        </div>
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
          Crear cuenta
        </button>
      </form>
    </div>
  );
}
