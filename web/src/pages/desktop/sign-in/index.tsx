import {
  EyeClosedIcon,
  EyeIcon,
  LockKeyholeIcon,
  User2Icon,
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '~/components/ui/button';
import { Link, type Location, useLocation } from 'react-router-dom';
import { SubmitHandler, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { wait } from '~/utils/wait.ts';
import { Alert } from '~/components/ui/alert';
import { Layout } from '../welcome/_widgets/layout.tsx';

// let aborter: AbortController;

const schema = z.object({
  server: z.string(),
  username: z.string().min(3).max(24),
  password: z.string().min(6).max(64),
});
type Schema = z.infer<typeof schema>;

export default function SignInPage() {
  const [masked, setMasked] = useState(true);
  const location = useLocation() as Location<{
    server: string;
    version: string;
  }>;
  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    defaultValues: { server: location.state.server },
  });
  const onChangeMasked = () => {
    setMasked((prev) => !prev);
  };
  const onSubmit: SubmitHandler<Schema> = async (values, evt) => {
    evt?.preventDefault();
    clearErrors('root');
    await wait(3600);
    console.log('values', values);
    setError('root', {
      message: '伺服器未响应',
    });
  };

  return (
    <Layout>
      <section>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit(onSubmit)}>
          <div className="text-sm">
            <span className="mr-1 font-medium">Server:</span>
            <span className="text-gray-400">
              Ephemera v{location.state.version || '<none>'}
            </span>
          </div>
          {errors.root && (
            <Alert variant="destructive">{errors.root.message}</Alert>
          )}
          <div>
            <label htmlFor="username" className="text-sm font-medium">
              Username
            </label>
            <div className="mt-2 grid grid-cols-1">
              <input
                id="username"
                type="text"
                className="col-start-1 row-start-1 bg-gray-100 px-9 py-3"
                {...register('username')}
              />
              <User2Icon className="pointer-events-none col-start-1 row-start-1 ml-3 h-4 w-4 self-center text-gray-400" />
            </div>
            {errors.username && (
              <p className="mt-1 text-sm text-red-500">
                {errors.username?.message}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <div className="mt-2 grid grid-cols-[repeat(1,_minmax(0,_1fr),_1)]">
              <input
                id="password"
                type={masked ? 'password' : 'text'}
                className="col-start-1 col-end-3 row-start-1 bg-gray-100 px-9 py-3"
                {...register('password')}
              />
              <LockKeyholeIcon className="pointer-events-none col-start-1 row-start-1 ml-3 h-4 w-4 self-center text-gray-400" />
              {masked ? (
                <EyeClosedIcon
                  onClick={onChangeMasked}
                  className="col-start-3 col-end-1 row-start-1 mr-3 h-4 w-4 cursor-pointer self-center justify-self-end text-gray-400 select-none hover:text-gray-600"
                />
              ) : (
                <EyeIcon
                  onClick={onChangeMasked}
                  className="col-start-3 col-end-1 row-start-1 mr-3 h-4 w-4 cursor-pointer self-center justify-self-end text-gray-400 select-none hover:text-gray-600"
                />
              )}
            </div>
            {errors.password && (
              <p className="mt-1 text-sm text-red-500">
                {errors.password?.message}
              </p>
            )}
          </div>
          <Button type="submit" loading={isSubmitting}>
            {isSubmitting ? 'Signing in...' : 'Sign in'}
          </Button>
        </form>
        <div className="mt-4 flex gap-2 text-sm">
          <Link className="underline" to="/sign-up">
            Sign up
          </Link>
          <Link className="underline" to="/reset-password">
            Forgot password
          </Link>
        </div>
      </section>
    </Layout>
  );
}
