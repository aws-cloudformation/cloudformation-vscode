import { window, StatusBarAlignment, StatusBarItem, ThemeColor } from 'vscode';
import { TemplateStatus } from '../cfn/TemplateRequestType';

let globalStatusBarItem: StatusBarItem | undefined;

function getStatusProperties(status: TemplateStatus): { text: string; color: ThemeColor | undefined } {
    let color: ThemeColor | undefined = undefined;
    let text: string;

    switch (status) {
        case TemplateStatus.DEPLOYMENT_STARTED:
            text = '$(sync~spin) Validation Starting...';
            break;
        case TemplateStatus.VALIDATION_IN_PROGRESS:
            text = '$(sync~spin) Validating Template...';
            break;
        case TemplateStatus.VALIDATION_COMPLETE:
            text = '$(check) Validation Complete';
            break;
        case TemplateStatus.VALIDATION_FAILED:
            text = '$(error) Validation Failed';
            color = new ThemeColor('statusBarItem.errorBackground');
            break;
        case TemplateStatus.DEPLOYMENT_IN_PROGRESS:
            text = '$(sync~spin) Deploying Stack...';
            break;
        case TemplateStatus.DEPLOYMENT_COMPLETE:
            text = '$(check) Deployment Complete';
            break;
        case TemplateStatus.DEPLOYMENT_FAILED:
            text = '$(error) Deployment Failed';
            color = new ThemeColor('statusBarItem.errorBackground');
            break;
        default:
            text = '$(sync~spin) Processing...';
    }

    return { text, color };
}

export function createDeploymentStatusBar(): StatusBarItem {
    globalStatusBarItem ??= window.createStatusBarItem(StatusBarAlignment.Left, 100);

    globalStatusBarItem.text = '$(sync~spin) Validation Starting...';
    globalStatusBarItem.show();

    return globalStatusBarItem;
}

export function updateDeploymentStatus(statusBarItem: StatusBarItem, status: TemplateStatus): void {
    const properties = getStatusProperties(status);

    statusBarItem.text = properties.text;
    statusBarItem.backgroundColor = properties.color;
}
