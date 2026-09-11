/** A runtime identity token carrying the compile-time type of a service. */
export interface ServiceKey<T> {
  readonly id: string;
  readonly token: symbol;
  readonly __type?: T;
}

/** Named service dependencies or provisions declared by a plugin. */
export type ServiceDefinitions = Record<string, ServiceKey<unknown>>;

/** Resolves a service definition record to the corresponding service values. */
export type ResolvedServices<S extends ServiceDefinitions> = {
  readonly [K in keyof S]: S[K] extends ServiceKey<infer T> ? T : never;
};

/** Creates a unique typed key for registering and requesting a service. */
export function serviceKey<T>(id: string): ServiceKey<T> {
  return { id, token: Symbol(id) };
}

/** A service supplied by the application before plugin initialization. */
export interface InitialService<T> {
  key: ServiceKey<T>;
  value: T;
}
