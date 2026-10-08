import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AreaDeTexto, Aviso, Botao, Campo, Carregando, Selecao, Titulo } from '../components/ui'
import { useLoja, useRepresentantes, useSalvarLoja } from '../lib/api'
import { useAcesso } from '../lib/auth'
import { buscarPorCep, buscarPorRua, formatarCep, type Endereco } from '../lib/cep'
import { NOME_MODALIDADE } from '../lib/formato'
import type { Loja, LojaStatus, Modalidade } from '../lib/tipos'

const VAZIA = {
  nome: '',
  segmento: 'Arena de jogos de praia',
  cep: '',
  endereco: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: 'Maringá',
  uf: 'PR',
  contato_nome: '',
  contato_telefone: '',
  observacoes: '',
  representante_id: '',
  modalidade: 'kit_teste' as Modalidade,
  status: 'ativa' as LojaStatus,
}

export function LojaForm() {
  const { id } = useParams()
  const navegar = useNavigate()
  const { ehGestao, meuRepresentanteId } = useAcesso()
  const existente = useLoja(id)
  const representantes = useRepresentantes()
  const salvar = useSalvarLoja()
  const [form, setForm] = useState(VAZIA)

  useEffect(() => {
    const l = existente.data
    if (l) {
      setForm({
        nome: l.nome,
        segmento: l.segmento ?? '',
        cep: formatarCep(l.cep ?? ''),
        endereco: l.endereco ?? '',
        numero: l.numero ?? '',
        complemento: l.complemento ?? '',
        bairro: l.bairro ?? '',
        cidade: l.cidade,
        uf: l.uf,
        contato_nome: l.contato_nome ?? '',
        contato_telefone: l.contato_telefone ?? '',
        observacoes: l.observacoes ?? '',
        representante_id: l.representante_id,
        modalidade: l.modalidade,
        status: l.status,
      })
    }
  }, [existente.data])

  // Busca de endereço: pelo CEP (preenche rua, bairro e cidade) ou pelo nome
  // da rua na cidade informada (sugere as ruas e traz o CEP).
  const [sugestoes, setSugestoes] = useState<Endereco[]>([])
  const [recadoCep, setRecadoCep] = useState('')
  const busca = useRef<{ cancelar?: AbortController; espera?: number }>({})

  const aplicar = (e: Endereco) => {
    setForm((f) => ({ ...f, cep: formatarCep(e.cep), endereco: e.endereco || f.endereco, bairro: e.bairro || f.bairro, cidade: e.cidade, uf: e.uf }))
    setSugestoes([])
  }

  function novaBusca() {
    busca.current.cancelar?.abort()
    window.clearTimeout(busca.current.espera)
    return (busca.current.cancelar = new AbortController())
  }

  async function mudarCep(texto: string) {
    const cep = formatarCep(texto)
    setForm((f) => ({ ...f, cep }))
    setRecadoCep('')
    const controle = novaBusca()
    if (cep.length < 9) return
    setRecadoCep('Buscando.')
    try {
      const achado = await buscarPorCep(cep, controle.signal)
      if (achado) aplicar(achado)
      setRecadoCep(achado ? 'Endereço preenchido. Confira e informe o número.' : 'CEP não encontrado. Preencha o endereço à mão.')
    } catch (erro) {
      if (!controle.signal.aborted) setRecadoCep('Não deu para buscar o CEP agora. Preencha o endereço à mão.')
    }
  }

  function mudarRua(texto: string) {
    setForm((f) => ({ ...f, endereco: texto }))
    const controle = novaBusca()
    if (texto.trim().length < 3 || !form.cidade.trim()) return setSugestoes([])
    busca.current.espera = window.setTimeout(async () => {
      try {
        setSugestoes((await buscarPorRua(form.uf || 'PR', form.cidade, texto, controle.signal)).slice(0, 8))
      } catch {
        if (!controle.signal.aborted) setSugestoes([])
      }
    }, 450)
  }

  if (id && existente.isPending) return <Carregando />

  const campo = (nome: keyof typeof VAZIA) => ({
    value: form[nome],
    onChange: (e: { target: { value: string } }) => setForm((f) => ({ ...f, [nome]: e.target.value })),
  })

  async function enviar(e: FormEvent) {
    e.preventDefault()
    const texto = (v: string) => v.trim() || null
    const dados: Partial<Loja> = {
      nome: form.nome.trim(),
      segmento: texto(form.segmento),
      cep: form.cep.replace(/\D/g, '').length === 8 ? form.cep.replace(/\D/g, '') : null,
      endereco: texto(form.endereco),
      numero: texto(form.numero),
      complemento: texto(form.complemento),
      bairro: texto(form.bairro),
      cidade: form.cidade.trim() || 'Maringá',
      uf: /^[A-Za-z]{2}$/.test(form.uf.trim()) ? form.uf.trim().toUpperCase() : 'PR',
      contato_nome: texto(form.contato_nome),
      contato_telefone: texto(form.contato_telefone),
      observacoes: texto(form.observacoes),
    }
    // Representante, modalidade e status só a gestão muda depois de criada.
    if (!id || ehGestao) {
      dados.representante_id = ehGestao ? form.representante_id : meuRepresentanteId!
      dados.modalidade = form.modalidade
    }
    if (id && ehGestao) dados.status = form.status
    const loja = await salvar.mutateAsync(id ? { id, ...dados } : dados)
    navegar(`/lojas/${loja.id}`, { replace: true })
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      <Titulo>{id ? 'Editar loja' : 'Nova loja'}</Titulo>
      <Campo rotulo="Nome da loja" required {...campo('nome')} />
      <Campo rotulo="Segmento" {...campo('segmento')} />
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="CEP" inputMode="numeric" autoComplete="postal-code" placeholder="87000-000" value={form.cep} onChange={(e) => mudarCep(e.target.value)} />
        <Campo rotulo="Número" inputMode="numeric" {...campo('numero')} />
      </div>
      {recadoCep && <p className="-mt-2 text-xs text-verde">{recadoCep}</p>}

      <div>
        <Campo rotulo="Rua ou avenida" autoComplete="off" placeholder="Digite o CEP acima ou o nome da rua" value={form.endereco} onChange={(e) => mudarRua(e.target.value)} />
        {sugestoes.length > 0 && (
          <ul className="mt-1 divide-y divide-linha overflow-hidden rounded-xl border border-marrom/25 bg-papel">
            {sugestoes.map((s) => (
              <li key={s.cep}>
                <button type="button" onClick={() => aplicar(s)} className="block w-full px-3 py-2.5 text-left active:bg-areia/40">
                  <span className="block text-sm font-semibold">{s.endereco}</span>
                  <span className="block text-xs text-marrom/65">{[s.trecho, s.bairro, formatarCep(s.cep)].filter(Boolean).join(' · ')}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Campo rotulo="Complemento" placeholder="Opcional." {...campo('complemento')} />
      <Campo rotulo="Bairro" {...campo('bairro')} />
      <div className="grid grid-cols-[1fr_5rem] gap-3">
        <Campo rotulo="Cidade" {...campo('cidade')} />
        <Campo rotulo="UF" maxLength={2} {...campo('uf')} />
      </div>
      <Campo rotulo="Nome do contato" {...campo('contato_nome')} />
      <Campo rotulo="WhatsApp do contato" type="tel" inputMode="tel" placeholder="(44) 90000-0000" {...campo('contato_telefone')} />

      {ehGestao && (
        <Selecao rotulo="Representante responsável" required {...campo('representante_id')}>
          <option value="">Escolha</option>
          {representantes.data?.filter((r) => r.ativo || r.id === form.representante_id).map((r) => (
            <option key={r.id} value={r.id}>
              {r.nome}
            </option>
          ))}
        </Selecao>
      )}

      {(!id || ehGestao) && (
        <Selecao rotulo="Modalidade" {...campo('modalidade')}>
          {(Object.keys(NOME_MODALIDADE) as Modalidade[]).map((m) => (
            <option key={m} value={m}>
              {NOME_MODALIDADE[m]}
            </option>
          ))}
        </Selecao>
      )}

      {id && ehGestao && (
        <Selecao rotulo="Situação" {...campo('status')}>
          <option value="ativa">Ativa</option>
          <option value="pausada">Pausada</option>
          <option value="encerrada">Encerrada</option>
        </Selecao>
      )}

      <AreaDeTexto rotulo="Observações" valor={form.observacoes} aoMudar={(v) => setForm((f) => ({ ...f, observacoes: v }))} dica="Melhor horário, onde fica o expositor, combinado de reposição." />

      <Aviso erro={salvar.error} />
      <Botao type="submit" cheio disabled={salvar.isPending}>
        {salvar.isPending ? 'Salvando.' : 'Salvar'}
      </Botao>
      <Botao variante="secundario" cheio onClick={() => navegar(-1)}>
        Cancelar
      </Botao>
    </form>
  )
}
