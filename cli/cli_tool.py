#!/usr/bin/env python3
"""
Therapeutic Conversation Evaluation CLI Tool

Command-line interface for batch evaluation of conversation files
using the Therapist Tool API backend.

Supports multiple LLM providers: OpenAI, Gemini, Claude, Ollama.
"""
import argparse
import sys
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
import logging
from datetime import datetime

import inquirer
from rich.console import Console
from rich.progress import track, Progress, SpinnerColumn, TextColumn, BarColumn
from rich.table import Table
from rich.panel import Panel
from rich import print as rprint

from config_loader import (
    load_env_config, 
    prompt_for_api_key, 
    get_api_key_for_provider,
    mask_api_key
)
from file_handler import find_conversation_files, load_conversation, save_results, create_output_filename
from api_client import APIClient

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

console = Console()


def setup_argparser() -> argparse.ArgumentParser:
    """Setup command-line argument parser."""
    parser = argparse.ArgumentParser(
        description='Evaluate therapeutic conversations using LLM models',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Interactive mode (recommended)
  python cli_tool.py

  # With command-line arguments
  python cli_tool.py --input ./conversations --backend http://localhost:8000

  # Specify provider and model
  python cli_tool.py --input ./conversations --provider gemini --model gemini-2.5-flash
        """
    )
    
    parser.add_argument(
        '-i', '--input',
        type=str,
        help='Input directory containing conversation JSON files'
    )
    
    parser.add_argument(
        '-o', '--output',
        type=str,
        default='./results',
        help='Output directory for results (default: input_dir/results)'
    )
    
    parser.add_argument(
        '-b', '--backend',
        type=str,
        default='http://localhost:8000',
        help='Backend API address (default: http://localhost:8000)'
    )
    
    parser.add_argument(
        '--provider',
        type=str,
        choices=['openai', 'gemini', 'claude', 'ollama'],
        help='LLM provider to use'
    )
    
    parser.add_argument(
        '--model',
        type=str,
        help='Model to use (e.g., gpt-4o, gemini-2.5-flash, claude-haiku-4-5-20251001)'
    )
    
    parser.add_argument(
        '--api-key',
        type=str,
        help='API key for the selected provider'
    )
    
    parser.add_argument(
        '--hf-key',
        type=str,
        help='HuggingFace API key (optional, for some evaluators)'
    )
    
    parser.add_argument(
        '--skip-evaluators',
        action='store_true',
        help='Skip evaluator metrics (only run literature evaluation)'
    )
    
    parser.add_argument(
        '--skip-literature',
        action='store_true',
        help='Skip literature metrics (only run evaluator evaluation)'
    )
    
    parser.add_argument(
        '-v', '--verbose',
        action='store_true',
        help='Enable verbose logging'
    )
    
    return parser


def select_provider(client: APIClient) -> Tuple[str, str, str]:
    """
    Interactive selection of LLM provider and model.
    
    Args:
        client: API client instance
        
    Returns:
        Tuple of (provider, model, api_key)
    """
    console.print("\n[bold cyan]LLM Provider Selection[/bold cyan]")
    
    # Fetch available models from API
    try:
        models_response = client.list_models()
        providers_data = models_response.get('providers', {})
    except Exception as e:
        console.print(f"[red]❌ Failed to fetch models: {e}[/red]")
        providers_data = {}
    
    # Build provider choices
    provider_choices = []
    for provider_name, models in providers_data.items():
        model_count = len(models) if models else 0
        provider_choices.append((f"{provider_name.title()} ({model_count} models)", provider_name))
    
    if not provider_choices:
        console.print("[yellow]⚠ No providers available from API, using defaults[/yellow]")
        provider_choices = [
            ("OpenAI (GPT models)", "openai"),
            ("Gemini (Google AI)", "gemini"),
            ("Claude (Anthropic)", "claude"),
            ("Ollama (Local)", "ollama"),
        ]
    
    # Select provider
    questions = [
        inquirer.List(
            'provider',
            message="Select LLM provider",
            choices=provider_choices,
        )
    ]
    answers = inquirer.prompt(questions)
    if not answers:
        console.print("[red]❌ Provider selection cancelled[/red]")
        sys.exit(1)
    
    provider = answers['provider']
    console.print(f"[green]✓ Selected provider: {provider}[/green]")
    
    # Select model for provider
    models = providers_data.get(provider, [])
    if models:
        model_choices = [(f"{m['name']} ({m['id']})", m['id']) for m in models]
    else:
        # Fallback defaults
        model_choices = [("Default", "gpt-4o")]
    
    questions = [
        inquirer.List(
            'model',
            message=f"Select model for {provider}",
            choices=model_choices,
        )
    ]
    answers = inquirer.prompt(questions)
    if not answers:
        console.print("[red]❌ Model selection cancelled[/red]")
        sys.exit(1)
    
    model = answers['model']
    console.print(f"[green]✓ Selected model: {model}[/green]")
    
    # Get API key
    if provider == 'ollama':
        api_key = ""  # Ollama doesn't need API key
        console.print("[dim]Ollama running locally, no API key needed[/dim]")
    else:
        env_config = load_env_config()
        existing_key = get_api_key_for_provider(provider, env_config)
        
        if existing_key:
            masked = mask_api_key(existing_key)
            console.print(f"[dim]Found API key in .env ({masked})[/dim]")
            
            # Validate the key
            console.print("[dim]Validating API key...[/dim]")
            try:
                validation = client.validate_api_key(provider, existing_key)
                if validation.get('valid'):
                    console.print("[green]✓ API key is valid[/green]")
                    api_key = existing_key
                else:
                    console.print(f"[yellow]⚠ API key validation failed: {validation.get('message')}[/yellow]")
                    api_key = prompt_for_api_key(f"{provider.title()} API Key", required=True)
            except Exception as e:
                console.print(f"[yellow]⚠ Could not validate key: {e}[/yellow]")
                # Ask user if they want to use it anyway
                questions = [
                    inquirer.Confirm(
                        'use_anyway',
                        message="Use this key anyway?",
                        default=True
                    )
                ]
                answers = inquirer.prompt(questions)
                if answers and answers['use_anyway']:
                    api_key = existing_key
                else:
                    api_key = prompt_for_api_key(f"{provider.title()} API Key", required=True)
        else:
            console.print(f"[yellow]No API key found for {provider} in environment[/yellow]")
            api_key = prompt_for_api_key(f"{provider.title()} API Key", required=True)
            
            if api_key:
                # Validate the new key
                console.print("[dim]Validating API key...[/dim]")
                try:
                    validation = client.validate_api_key(provider, api_key)
                    if validation.get('valid'):
                        console.print("[green]✓ API key is valid[/green]")
                    else:
                        console.print(f"[red]❌ API key invalid: {validation.get('message')}[/red]")
                        sys.exit(1)
                except Exception as e:
                    console.print(f"[yellow]⚠ Could not validate key: {e}[/yellow]")
    
    if not api_key and provider != 'ollama':
        console.print("[red]❌ API key is required[/red]")
        sys.exit(1)
    
    return provider, model, api_key


def get_provider_config(args: argparse.Namespace, client: APIClient) -> Tuple[str, str, str, Optional[str]]:
    """
    Get provider configuration from arguments or interactive selection.
    
    Returns:
        Tuple of (provider, model, api_key, huggingface_key)
    """
    env_config = load_env_config()
    
    if args.provider and args.model and (args.api_key or args.provider == 'ollama'):
        # All provided via CLI
        provider = args.provider
        model = args.model
        api_key = args.api_key or ""
        
        # Validate if not ollama
        if provider != 'ollama':
            console.print("[dim]Validating API key...[/dim]")
            try:
                validation = client.validate_api_key(provider, api_key)
                if validation.get('valid'):
                    console.print("[green]✓ API key is valid[/green]")
                else:
                    console.print(f"[red]❌ API key invalid: {validation.get('message')}[/red]")
                    sys.exit(1)
            except Exception as e:
                console.print(f"[yellow]⚠ Could not validate key: {e}[/yellow]")
    else:
        # Interactive selection
        provider, model, api_key = select_provider(client)
    
    # Get HuggingFace key (mandatory)
    hf_key = args.hf_key
    env_hf_key = env_config.get('HUGGINGFACE_API_KEY')
    
    # Check CLI arg first
    if hf_key:
        console.print("[dim]Validating provided HuggingFace API key...[/dim]")
        validation = client.validate_huggingface_key(hf_key)
        if not validation.get('valid'):
            console.print(f"[red]❌ Provided HuggingFace API key invalid: {validation.get('message')}[/red]")
            hf_key = None
        else:
            console.print("[green]✓ HuggingFace API key is valid[/green]")
    
    # Loop until valid key
    first_try = True
    while not hf_key:
        current_existing = env_hf_key if first_try else None
        hf_key = prompt_for_api_key("HuggingFace API Key", existing_key=current_existing, required=True)
        
        console.print("[dim]Validating HuggingFace API key...[/dim]")
        validation = client.validate_huggingface_key(hf_key)
        
        if validation.get('valid'):
            console.print("[green]✓ HuggingFace API key is valid[/green]")
            break
        else:
            console.print(f"[red]❌ HuggingFace API key invalid: {validation.get('message')}[/red]")
            hf_key = None
            first_try = False
            
    return provider, model, api_key, hf_key


def select_metrics(client: APIClient, evaluation_type: str) -> List[str]:
    """
    Interactive selection of metrics to evaluate.
    
    Args:
        client: API client instance
        evaluation_type: 'evaluators' or 'literature'
        
    Returns:
        List of selected metric names
    """
    try:
        if evaluation_type == 'evaluators':
            response = client.list_available_metrics()
            metrics = response.get('metrics', [])
            choices = [(f"{m['label']} ({m['name']})", m['name']) for m in metrics]
        else:  # literature
            response = client.list_literature_metrics()
            metrics = response.get('metrics', [])
            choices = [(m['metric_name'], m['metric_name']) for m in metrics]
        
        if not choices:
            console.print(f"[yellow]⚠ No {evaluation_type} metrics available[/yellow]")
            return []
        
        questions = [
            inquirer.Checkbox(
                'metrics',
                message=f"Select {evaluation_type} metrics to evaluate (Space to toggle, Enter to confirm)",
                choices=choices,
            )
        ]
        
        answers = inquirer.prompt(questions)
        
        if answers:
            return answers['metrics']
        return []
    
    except Exception as e:
        console.print(f"[red]❌ Error fetching {evaluation_type} metrics: {e}[/red]")
        return []


def evaluate_file(
    client: APIClient,
    file_path: Path,
    evaluator_metrics: List[str],
    literature_metrics: List[str],
    provider: str,
    model: str,
    api_key: str,
    huggingface_key: Optional[str] = None
) -> tuple[Dict[str, Any], List[Dict[str, str]]]:
    """
    Evaluate a single conversation file.
    
    Args:
        client: API client instance
        file_path: Path to conversation file
        evaluator_metrics: List of evaluator metric names
        literature_metrics: List of literature metric names
        provider: LLM provider name
        model: Model identifier
        api_key: API key for the provider
        huggingface_key: Optional HuggingFace API key
        
    Returns:
        Tuple of (evaluation results, original conversation)
    """
    # Load conversation
    data = load_conversation(file_path)
    
    # Extract conversation
    if isinstance(data, dict) and 'conversation' in data:
        conversation = data['conversation']
    else:
        conversation = data
    
    # Store original conversation for later use
    original_conversation = conversation.copy() if isinstance(conversation, list) else conversation
    
    results = {
        'file': str(file_path),
        'timestamp': datetime.now().isoformat(),
        'provider': provider,
        'model': model,
        'evaluator_results': None,
        'literature_results': None,
        'errors': []
    }
    
    # Run evaluator metrics
    if evaluator_metrics:
        try:
            eval_response = client.evaluate_conversation(
                conversation=conversation,
                metrics=evaluator_metrics,
                provider=provider,
                model=model,
                api_key=api_key,
                huggingface_key=huggingface_key
            )
            results['evaluator_results'] = eval_response
        except Exception as e:
            error_msg = f"Evaluator error: {str(e)}"
            logger.error(error_msg)
            results['errors'].append(error_msg)
    
    # Run literature metrics
    if literature_metrics:
        try:
            lit_response = client.evaluate_literature(
                conversation=conversation,
                metric_names=literature_metrics,
                provider=provider,
                model=model,
                api_key=api_key
            )
            results['literature_results'] = lit_response
        except Exception as e:
            error_msg = f"Literature error: {str(e)}"
            logger.error(error_msg)
            results['errors'].append(error_msg)
    
    return results, original_conversation


def main():
    """Main CLI entry point."""
    parser = setup_argparser()
    args = parser.parse_args()
    
    # Setup verbose logging
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    # Print header
    console.print(Panel.fit(
        "[bold blue]Therapeutic Conversation Evaluation CLI[/bold blue]\n"
        "Batch evaluation tool for therapist-patient conversations\n"
        "[dim]Supports: OpenAI, Gemini, Claude, Ollama[/dim]",
        border_style="blue"
    ))
    
    # Get backend address from .env or args
    console.print("\n[bold cyan]Backend Configuration[/bold cyan]")
    env_config = load_env_config()
    
    if args.backend != 'http://localhost:8000':  # User specified via CLI
        backend_url = args.backend
    elif env_config.get('BACKEND_URL'):  # Found in .env
        questions = [
            inquirer.Confirm(
                'use_env_backend',
                message=f"Found backend URL in .env ({env_config['BACKEND_URL']}). Use it?",
                default=True
            )
        ]
        answers = inquirer.prompt(questions)
        if answers and answers['use_env_backend']:
            backend_url = env_config['BACKEND_URL']
        else:
            questions = [
                inquirer.Text(
                    'backend_url',
                    message="Enter backend URL",
                    default='http://localhost:8000'
                )
            ]
            answers = inquirer.prompt(questions)
            backend_url = answers['backend_url'] if answers else 'http://localhost:8000'
    else:  # Not in args or .env, prompt user
        questions = [
            inquirer.Text(
                'backend_url',
                message="Enter backend URL",
                default='http://localhost:8000'
            )
        ]
        answers = inquirer.prompt(questions)
        backend_url = answers['backend_url'] if answers else 'http://localhost:8000'
    
    # Check backend health immediately
    console.print(f"\n[bold cyan]Checking backend at {backend_url}...[/bold cyan]")
    client = APIClient(backend_url)
    
    if not client.check_health():
        console.print(f"[red]❌ Backend not available at {backend_url}[/red]")
        console.print("[yellow]Make sure the API server is running:[/yellow]")
        console.print("  cd api && python main.py")
        sys.exit(1)
    
    console.print("[green]✓ Backend is healthy[/green]")
    
    # Get provider configuration (provider, model, api_key)
    provider, model, api_key, hf_key = get_provider_config(args, client)
    
    console.print(f"\n[dim]Using: {provider}/{model}[/dim]")
    
    # Get input directory
    if not args.input:
        questions = [
            inquirer.Path(
                'input_dir',
                message="Enter path to conversation files directory",
                exists=True,
                path_type=inquirer.Path.DIRECTORY,
            )
        ]
        answers = inquirer.prompt(questions)
        if not answers:
            console.print("[red]❌ Input directory required[/red]")
            sys.exit(1)
        input_dir = answers['input_dir']
    else:
        input_dir = args.input
    
    # Select evaluation methods
    evaluator_metrics = []
    literature_metrics = []
    
    if not args.skip_evaluators:
        console.print("\n[bold cyan]Select Evaluator Metrics[/bold cyan]")
        evaluator_metrics = select_metrics(client, 'evaluators')
    
    if not args.skip_literature:
        console.print("\n[bold cyan]Select Literature Metrics[/bold cyan]")
        literature_metrics = select_metrics(client, 'literature')
    
    if not evaluator_metrics and not literature_metrics:
        console.print("[red]❌ No metrics selected. Exiting.[/red]")
        sys.exit(1)
    
    # Find conversation files
    console.print(f"\n[bold cyan]Finding conversation files in {input_dir}...[/bold cyan]")
    try:
        files = find_conversation_files(input_dir)
    except Exception as e:
        console.print(f"[red]❌ Error finding files: {e}[/red]")
        sys.exit(1)
    
    if not files:
        console.print(f"[yellow]⚠ No JSON files found in {input_dir}[/yellow]")
        sys.exit(0)
    
    console.print(f"[green]✓ Found {len(files)} conversation file(s)[/green]")
    
    # Create output directory - use input_dir/results if --output not specified
    if args.output == './results':  # Default value, user didn't specify
        output_dir = Path(input_dir) / 'results'
        output_dir.mkdir(parents=True, exist_ok=True)
        console.print(f"\n[dim]💾 Results will be saved in: {output_dir.absolute()}[/dim]")
    else:
        output_dir = Path(args.output)
        output_dir.mkdir(parents=True, exist_ok=True)
        console.print(f"\n[dim]💾 Results will be saved in: {output_dir.absolute()}[/dim]")
    
    # Process files
    console.print(f"\n[bold cyan]Evaluating conversations...[/bold cyan]")
    console.print(f"Provider: {provider} | Model: {model}")
    console.print(f"Evaluator metrics: {len(evaluator_metrics)}")
    console.print(f"Literature metrics: {len(literature_metrics)}")
    
    success_count = 0
    error_count = 0
    
    for file_path in track(files, description="Processing files..."):
        try:
            results, conversation = evaluate_file(
                client=client,
                file_path=file_path,
                evaluator_metrics=evaluator_metrics,
                literature_metrics=literature_metrics,
                provider=provider,
                model=model,
                api_key=api_key,
                huggingface_key=hf_key
            )
            
            # Save results
            output_path = create_output_filename(file_path, output_dir)
            save_results(results, output_path)
            
            # Generate Excel report
            from excel_generator import generate_excel_report
            try:
                generate_excel_report(results, output_path, conversation)
                logger.debug(f"Generated Excel report for {file_path.name}")
            except Exception as e:
                logger.warning(f"Failed to generate Excel report: {e}")
            
            if results['errors']:
                error_count += 1
                console.print(f"[yellow]⚠ {file_path.name} - completed with errors[/yellow]")
            else:
                success_count += 1
                console.print(f"[green]✓ {file_path.name}[/green]")
        
        except Exception as e:
            error_count += 1
            console.print(f"[red]❌ {file_path.name} - {str(e)}[/red]")
            logger.error(f"Error processing {file_path}: {e}", exc_info=True)
    
    # Print summary
    console.print("\n" + "="*60)
    table = Table(title="Evaluation Summary", show_header=True, header_style="bold magenta")
    table.add_column("Metric", style="cyan")
    table.add_column("Value", justify="right", style="green")
    
    table.add_row("Total Files", str(len(files)))
    table.add_row("Successful", str(success_count))
    table.add_row("Errors", str(error_count))
    table.add_row("Provider", provider)
    table.add_row("Model", model)
    table.add_row("Output Directory", str(output_dir.absolute()))
    
    console.print(table)
    
    if success_count > 0:
        console.print(f"\n[bold green]✓ Results saved to {output_dir}[/bold green]")
        console.print(f"[dim]💡 Tip: Open the .xlsx files in Excel or Google Sheets to view results[/dim]")
    
    sys.exit(0 if error_count == 0 else 1)


if __name__ == "__main__":
    main()
