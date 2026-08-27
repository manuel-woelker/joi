export interface ServiceKey<T> {
  readonly id: string;
  readonly token: symbol;
  readonly __type?: T;
}

export type ServiceDefinitions = Record<string, ServiceKey<unknown>>;

export type ResolvedServices<S extends ServiceDefinitions> = {
  readonly [K in keyof S]: S[K] extends ServiceKey<infer T> ? T : never;
};

export function serviceKey<T>(id: string): ServiceKey<T> {
  return { id, token: Symbol(id) };
}

export interface InitialService<T> {
  key: ServiceKey<T>;
  value: T;
}
